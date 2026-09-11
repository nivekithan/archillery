package bbolt

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"

	"go.etcd.io/bbolt"
)

var (
	blobsByOIDBucket = []byte("blobs-by-oid")
	blobsByIDBucket  = []byte("blobs-by-id")
	postingsBucket   = []byte("postings")
	revisionsBucket  = []byte("revisions")
	metadataBucket   = []byte("metadata")

	formatVersionKey   = []byte("format-version")
	formatVersionValue = []byte{1}
	nextBlobIDKey      = []byte("next-blob-id")
)

func openDatabase(path string) (*bbolt.DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create search database directory: %w", err)
	}

	database, err := bbolt.Open(path, 0o600, nil)
	if err != nil {
		return nil, fmt.Errorf("open search database: %w", err)
	}
	if err := initializeDatabase(database); err != nil {
		_ = database.Close()
		return nil, err
	}

	return database, nil
}

func initializeDatabase(database *bbolt.DB) error {
	if err := database.Update(func(transaction *bbolt.Tx) error {
		for _, name := range [][]byte{
			blobsByOIDBucket,
			blobsByIDBucket,
			postingsBucket,
			revisionsBucket,
			metadataBucket,
		} {
			if _, err := transaction.CreateBucketIfNotExists(name); err != nil {
				return err
			}
		}

		metadata := transaction.Bucket(metadataBucket)
		version := metadata.Get(formatVersionKey)
		if version == nil {
			if err := metadata.Put(formatVersionKey, formatVersionValue); err != nil {
				return err
			}
			nextBlobID := make([]byte, 8)
			binary.BigEndian.PutUint64(nextBlobID, 1)
			return metadata.Put(nextBlobIDKey, nextBlobID)
		}
		if !bytes.Equal(version, formatVersionValue) {
			return fmt.Errorf("unsupported search database format version %x", version)
		}
		return nil
	}); err != nil {
		return fmt.Errorf("initialize search database: %w", err)
	}
	return nil
}
