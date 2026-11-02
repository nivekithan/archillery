package pebble

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"math"

	"github.com/cockroachdb/pebble"
	gitrepo "github.com/nivekithan/archillery/apps/git-metadata-service/internal/git"
	gitUtils "github.com/nivekithan/archillery/apps/git-metadata-service/internal/git/utils"
	"github.com/nivekithan/archillery/apps/git-metadata-service/internal/search/bigram"
	"github.com/nivekithan/archillery/apps/git-metadata-service/internal/search/content"
)

const (
	blobFlagSearchable uint32 = 1 << iota
	blobFlagBinary
	blobFlagOversized
)

// Bound memory while amortizing chunk writes and synchronization across blobs.
const (
	maximumBatchBlobs    = 16384
	maximumBatchPostings = 8_000_000
)

func (engine *Engine) indexBlobs(ctx context.Context, paths []gitrepo.RepositoryPath) (map[string]uint32, error) {
	ids := make(map[string]uint32)
	sizes := make(map[string]int64)
	missing := make([]string, 0)

	for _, path := range paths {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if path.Type != "blob" {
			continue
		}
		if path.Size == nil {
			return nil, fmt.Errorf("missing size for blob %s", path.OID)
		}
		if _, seen := sizes[path.OID]; seen {
			continue
		}
		sizes[path.OID] = *path.Size
		raw, err := gitUtils.DecodeOID(path.OID)
		if err != nil {
			return nil, err
		}

		value, err := readValue(engine.database, recordKey(blobOIDPrefix, raw))

		if errors.Is(err, pebble.ErrNotFound) {
			missing = append(missing, path.OID)
			continue
		}

		if err != nil {
			return nil, err
		}

		if len(value) != 16 || binary.BigEndian.Uint32(value[:4]) == 0 {
			return nil, fmt.Errorf("invalid blob record for %s", path.OID)
		}

		ids[path.OID] = binary.BigEndian.Uint32(value[:4])
	}

	next, err := nextBlobID(engine.database)

	if err != nil {
		return nil, err
	}

	batch := engine.database.NewBatch()
	defer batch.Close()
	blobs, postings := 0, 0
	chunks := make([]postingChunk, 1<<16)
	flush := func() error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if blobs == 0 {
			return nil
		}
		var value [8]byte
		if err := writePostingChunks(batch, chunks, uint32(next-1)); err != nil {
			return err
		}
		binary.BigEndian.PutUint64(value[:], next)
		if err := batch.Set(nextBlobIDKey, value[:], nil); err != nil {
			return err
		}
		if err := batch.Commit(pebble.Sync); err != nil {
			return err
		}
		batch.Reset()
		for i := range chunks {
			chunks[i].encoded = chunks[i].encoded[:0]
			chunks[i].lastID = 0
		}
		blobs, postings = 0, 0
		return nil
	}
	add := func(oid string, flags uint32, bigrams []uint16) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if next > math.MaxUint32 {
			return errors.New("blob ID space exhausted")
		}
		raw, err := gitUtils.DecodeOID(oid)
		if err != nil {
			return err
		}
		id := uint32(next)
		var record [16]byte
		binary.BigEndian.PutUint32(record[:4], id)
		binary.BigEndian.PutUint64(record[4:12], uint64(sizes[oid]))
		binary.BigEndian.PutUint32(record[12:], flags)
		if err := batch.Set(recordKey(blobOIDPrefix, raw), record[:], nil); err != nil {
			return err
		}
		var reverse [32]byte
		copy(reverse[:20], raw)
		copy(reverse[20:], record[4:])
		if err := batch.Set(recordKey(blobIDPrefix, record[:4]), reverse[:], nil); err != nil {
			return err
		}
		for _, gram := range bigrams {
			chunks[gram].appendID(id)
		}
		ids[oid] = id
		next++
		blobs++
		postings += len(bigrams)
		if blobs >= maximumBatchBlobs || postings >= maximumBatchPostings {
			return flush()
		}
		return nil
	}
	readOIDs := make([]string, 0, len(missing))
	for _, oid := range missing {
		if sizes[oid] > content.MaxBlobSize {
			if err := add(oid, blobFlagOversized, nil); err != nil {
				return nil, err
			}
		} else {
			readOIDs = append(readOIDs, oid)
		}
	}
	if len(readOIDs) > 0 {
		err = engine.repository.VisitBlobs(ctx, readOIDs, func(blob gitrepo.Blob) error {
			if int64(len(blob.Content)) != sizes[blob.OID] {
				return fmt.Errorf("unexpected size for blob %s", blob.OID)
			}
			if !content.Searchable(blob.Content) {
				return add(blob.OID, blobFlagBinary, nil)
			}
			return add(blob.OID, blobFlagSearchable, bigram.Normalized(blob.Content))
		})
		if err != nil {
			return nil, err
		}
	}
	if err := flush(); err != nil {
		return nil, err
	}
	return ids, nil
}
