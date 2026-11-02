package pebble

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"

	"github.com/cockroachdb/pebble"
)

// Prefixes isolate records; posting chunks are prefix + big-endian bigram +
// the highest blob ID allocated by their batch. Values contain delta-varint IDs.
const (
	blobOIDPrefix  byte = 'o'
	blobIDPrefix   byte = 'i'
	postingPrefix  byte = 'p'
	revisionPrefix byte = 'r'
)

var (
	versionKey    = []byte("m/version")
	nextBlobIDKey = []byte("m/next-blob-id")
)

func recordKey(prefix byte, suffix []byte) []byte {
	key := make([]byte, 1+len(suffix))
	key[0] = prefix
	copy(key[1:], suffix)
	return key
}

// Pebble values are borrowed until their closer is closed.
func readValue(db *pebble.DB, key []byte) ([]byte, error) {
	value, closer, err := db.Get(key)
	if err != nil {
		return nil, err
	}
	copy := bytes.Clone(value)
	return copy, closer.Close()
}

func openDatabase(path string) (*pebble.DB, error) {
	db, err := pebble.Open(path, &pebble.Options{})
	if err != nil {
		return nil, err
	}
	if err := initializeDatabase(db); err != nil {
		return nil, errors.Join(err, db.Close())
	}
	return db, nil
}

func initializeDatabase(db *pebble.DB) error {
	version, err := readValue(db, versionKey)
	if err == nil {
		if !bytes.Equal(version, []byte{2}) {
			return fmt.Errorf("unsupported search index version %x", version)
		}
		_, err = nextBlobID(db)
		return err
	}
	if !errors.Is(err, pebble.ErrNotFound) {
		return err
	}
	iter, err := db.NewIter(nil)
	if err != nil {
		return err
	}
	nonempty := iter.First()
	err = errors.Join(iter.Error(), iter.Close())
	if err != nil {
		return err
	}
	if nonempty {
		return errors.New("search index has no schema version")
	}
	batch := db.NewBatch()
	defer batch.Close()
	if err := batch.Set(versionKey, []byte{2}, nil); err != nil {
		return err
	}
	var next [8]byte
	binary.BigEndian.PutUint64(next[:], 1)
	if err := batch.Set(nextBlobIDKey, next[:], nil); err != nil {
		return err
	}
	return batch.Commit(pebble.Sync)
}

func nextBlobID(db *pebble.DB) (uint64, error) {
	value, err := readValue(db, nextBlobIDKey)
	if err != nil {
		return 0, err
	}
	if len(value) != 8 || binary.BigEndian.Uint64(value) == 0 {
		return 0, errors.New("invalid next blob ID metadata")
	}
	return binary.BigEndian.Uint64(value), nil
}
