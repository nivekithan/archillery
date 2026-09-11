package search

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"math"

	gitrepo "github.com/nivekithan/archillery/apps/git-metadata-service/internal/git"
	gitUtils "github.com/nivekithan/archillery/apps/git-metadata-service/internal/git/utils"
	"go.etcd.io/bbolt"
)

const (
	MaxBlobSize = int64(2 << 20)

	blobFlagSearchable = uint32(1 << iota)
	blobFlagBinary
	blobFlagOversized
)

type preparedBlob struct {
	oid     string
	size    int64
	flags   uint32
	bigrams []uint16
}

type addBlobRequest struct {
	blob     preparedBlob
	response chan addBlobResult
}

type addBlobResult struct {
	id  uint32
	err error
}

func (engine *SearchEngine) indexBlobs(ctx context.Context, paths []gitrepo.RepositoryPath) (map[string]uint32, error) {
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

	contentOIDs := make([]string, 0)
	for _, oid := range oids {
		if _, found := blobIDs[oid]; found {
			continue
		}
		if sizes[oid] > MaxBlobSize {
			id, err := engine.addBlob(ctx, preparedBlob{oid: oid, size: sizes[oid], flags: blobFlagOversized})
			if err != nil {
				return nil, err
			}
			blobIDs[oid] = id
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
		if searchableContent(blob.Content) {
			prepared.flags = blobFlagSearchable
			prepared.bigrams = normalizedBigrams(blob.Content)
		} else {
			prepared.flags = blobFlagBinary
		}
		id, err := engine.addBlob(ctx, prepared)
		if err != nil {
			return err
		}
		blobIDs[blob.OID] = id
		return nil
	}); err != nil {
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

func (engine *SearchEngine) loadBlobIDs(oids []string) (map[string]uint32, error) {
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

func (engine *SearchEngine) addBlob(ctx context.Context, blob preparedBlob) (uint32, error) {
	response := make(chan addBlobResult, 1)
	select {
	case engine.blobs <- addBlobRequest{blob: blob, response: response}:
	case <-ctx.Done():
		return 0, ctx.Err()
	}

	select {
	case result := <-response:
		return result.id, result.err
	case <-ctx.Done():
		return 0, ctx.Err()
	}
}

func (engine *SearchEngine) writeBlobs() {
	defer close(engine.writerDone)
	for request := range engine.blobs {
		id, err := engine.writeBlob(request.blob)
		request.response <- addBlobResult{id: id, err: err}
	}
}

func (engine *SearchEngine) writeBlob(blob preparedBlob) (uint32, error) {
	var blobID uint32
	err := engine.database.Update(func(transaction *bbolt.Tx) error {
		byOID := transaction.Bucket(blobsByOIDBucket)
		byID := transaction.Bucket(blobsByIDBucket)
		postings := transaction.Bucket(postingsBucket)
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
			postingKey := make([]byte, 6)
			binary.BigEndian.PutUint16(postingKey[:2], bigram)
			binary.BigEndian.PutUint32(postingKey[2:], blobID)
			if err := postings.Put(postingKey, []byte{}); err != nil {
				return err
			}
		}

		updatedNext := make([]byte, 8)
		binary.BigEndian.PutUint64(updatedNext, nextBlobID+1)
		return metadata.Put(nextBlobIDKey, updatedNext)
	})
	return blobID, err
}
