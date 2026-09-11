package bbolt

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"slices"

	gitrepo "github.com/nivekithan/archillery/apps/git-metadata-service/internal/git"
	gitUtils "github.com/nivekithan/archillery/apps/git-metadata-service/internal/git/utils"
	"github.com/nivekithan/archillery/apps/git-metadata-service/internal/search/bigram"
	"github.com/nivekithan/archillery/apps/git-metadata-service/internal/search/content"
	"go.etcd.io/bbolt"
)

const (
	// Preserve the persisted flag bits; bit zero is unused.
	blobFlagSearchable = uint32(1 << (iota + 1))
	blobFlagBinary
	blobFlagOversized
)

type preparedBlob struct {
	oid     string
	size    int64
	flags   uint32
	bigrams []uint16
}

// Bound transaction memory by both blob count and posting count.
const (
	maximumBatchBlobs    = 512
	maximumBatchPostings = 500_000
)

type addBlobRequest struct {
	blobs    []preparedBlob
	response chan []addBlobResult
}

type addBlobResult struct {
	id  uint32
	err error
}

func (engine *Engine) indexBlobs(ctx context.Context, paths []gitrepo.RepositoryPath) (map[string]uint32, error) {
	oids := blobOIDs(paths)
	blobIDs, err := engine.loadBlobIDs(oids)
	if err != nil {
		return nil, err
	}

	sizes := make(map[string]int64, len(oids))
	for _, path := range paths {
		if path.Type == "blob" && path.Size != nil {
			if _, found := sizes[path.OID]; !found {
				sizes[path.OID] = *path.Size
			}
		}
	}

	pending := make([]preparedBlob, 0, maximumBatchBlobs)
	postingCount := 0
	flush := func() error {
		if len(pending) == 0 {
			return nil
		}
		response := make(chan []addBlobResult, 1)
		select {
		case engine.blobs <- addBlobRequest{blobs: pending, response: response}:
		case <-ctx.Done():
			return ctx.Err()
		}
		select {
		case results := <-response:
			for i, result := range results {
				if result.err != nil {
					return result.err
				}
				blobIDs[pending[i].oid] = result.id
			}
		case <-ctx.Done():
			return ctx.Err()
		}
		pending = pending[:0]
		postingCount = 0
		return nil
	}
	add := func(blob preparedBlob) error {
		pending = append(pending, blob)
		postingCount += len(blob.bigrams)
		if len(pending) >= maximumBatchBlobs || postingCount >= maximumBatchPostings {
			return flush()
		}
		return nil
	}
	contentOIDs := make([]string, 0)
	for _, oid := range oids {
		if _, found := blobIDs[oid]; found {
			continue
		}
		if sizes[oid] > content.MaxBlobSize {
			err := add(preparedBlob{oid: oid, size: sizes[oid], flags: blobFlagOversized})
			if err != nil {
				return nil, err
			}
		} else {
			contentOIDs = append(contentOIDs, oid)
		}
	}

	if err := engine.repository.VisitBlobs(ctx, contentOIDs, func(blob gitrepo.Blob) error {
		expectedSize := sizes[blob.OID]
		if int64(len(blob.Content)) != expectedSize {
			return fmt.Errorf("blob %s has size %d, expected %d", blob.OID, len(blob.Content), expectedSize)
		}

		prepared := preparedBlob{oid: blob.OID, size: expectedSize}
		if content.Searchable(blob.Content) {
			prepared.flags = blobFlagSearchable
			prepared.bigrams = bigram.Normalized(blob.Content)
		} else {
			prepared.flags = blobFlagBinary
		}
		err := add(prepared)
		if err != nil {
			return err
		}
		return nil
	}); err != nil {
		return nil, err
	}
	if err := flush(); err != nil {
		return nil, err
	}
	return blobIDs, nil
}

func blobOIDs(paths []gitrepo.RepositoryPath) []string {
	oids := make([]string, 0, len(paths))
	seen := make(map[string]struct{})
	for _, path := range paths {
		if path.Type != "blob" || path.Size == nil {
			continue
		}
		if _, found := seen[path.OID]; found {
			continue
		}
		seen[path.OID] = struct{}{}
		oids = append(oids, path.OID)
	}
	return oids
}

func (engine *Engine) loadBlobIDs(oids []string) (map[string]uint32, error) {
	blobIDs := make(map[string]uint32, len(oids))
	err := engine.database.View(func(transaction *bbolt.Tx) error {
		byOID := transaction.Bucket(blobsByOIDBucket)
		for _, oid := range oids {
			key, err := gitUtils.DecodeOID(oid)
			if err != nil {
				return err
			}
			value := byOID.Get(key)
			if value == nil {
				continue
			}
			if len(value) != 16 {
				return fmt.Errorf("invalid blob record for %s", oid)
			}
			blobIDs[oid] = binary.BigEndian.Uint32(value[:4])
		}
		return nil
	})
	return blobIDs, err
}

func (engine *Engine) writeBlobs() {
	defer close(engine.writerDone)
	for request := range engine.blobs {
		results := make([]addBlobResult, len(request.blobs))
		err := engine.database.Update(func(tx *bbolt.Tx) error {
			keys := make([]uint64, 0)
			for i, blob := range request.blobs {
				id, err := engine.writeBlob(tx, blob, &keys)
				if err != nil {
					return err
				}
				results[i].id = id
			}
			// Group adjacent posting keys so each B+tree page is updated together.
			slices.Sort(keys)
			postings := tx.Bucket(postingsBucket)
			for _, key := range keys {
				encoded := make([]byte, 8)
				binary.BigEndian.PutUint64(encoded, key)
				if err := postings.Put(encoded[2:], []byte{}); err != nil {
					return err
				}
			}
			return nil
		})
		for i := range results {
			results[i].err = err
		}
		request.response <- results
	}
}

func (engine *Engine) writeBlob(transaction *bbolt.Tx, blob preparedBlob, keys *[]uint64) (uint32, error) {
	var blobID uint32
	err := func() error {
		byOID := transaction.Bucket(blobsByOIDBucket)
		byID := transaction.Bucket(blobsByIDBucket)
		oid, err := gitUtils.DecodeOID(blob.oid)
		if err != nil {
			return err
		}
		if existing := byOID.Get(oid); existing != nil {
			if len(existing) != 16 {
				return fmt.Errorf("invalid blob record for %s", blob.oid)
			}
			blobID = binary.BigEndian.Uint32(existing[:4])
			return nil
		}

		metadata := transaction.Bucket(metadataBucket)
		nextValue := metadata.Get(nextBlobIDKey)
		if len(nextValue) != 8 {
			return errors.New("invalid next blob ID metadata")
		}
		nextBlobID := binary.BigEndian.Uint64(nextValue)
		if nextBlobID == 0 || nextBlobID > math.MaxUint32 {
			return errors.New("blob ID space exhausted")
		}
		blobID = uint32(nextBlobID)

		idKey := make([]byte, 4)
		binary.BigEndian.PutUint32(idKey, blobID)
		if byID.Get(idKey) != nil {
			return fmt.Errorf("blob ID %d already exists", blobID)
		}
		oidValue := make([]byte, 16)
		binary.BigEndian.PutUint32(oidValue[:4], blobID)
		binary.BigEndian.PutUint64(oidValue[4:12], uint64(blob.size))
		binary.BigEndian.PutUint32(oidValue[12:16], blob.flags)
		if err := byOID.Put(oid, oidValue); err != nil {
			return err
		}

		idValue := make([]byte, 32)
		copy(idValue[:20], oid)
		binary.BigEndian.PutUint64(idValue[20:28], uint64(blob.size))
		binary.BigEndian.PutUint32(idValue[28:32], blob.flags)
		if err := byID.Put(idKey, idValue); err != nil {
			return err
		}
		for _, bigram := range blob.bigrams {
			*keys = append(*keys, uint64(bigram)<<32|uint64(blobID))
		}

		updatedNext := make([]byte, 8)
		binary.BigEndian.PutUint64(updatedNext, nextBlobID+1)
		return metadata.Put(nextBlobIDKey, updatedNext)
	}()
	return blobID, err
}
