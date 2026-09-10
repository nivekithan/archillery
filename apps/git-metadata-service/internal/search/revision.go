package search

import (
	"bytes"
	"encoding/gob"
	"errors"
	"fmt"
	"io"

	gitUtils "github.com/nivekithan/archillery/apps/git-metadata-service/internal/git/utils"
	"go.etcd.io/bbolt"
)

var (
	ErrRevisionNotFound = errors.New("revision manifest not found")
)

type RevisionFile struct {
	Path   string
	BlobID uint32
}

type RevisionManifest struct {
	Files []RevisionFile
}

func (engine *SearchEngine) getRevisionManifest(rootTreeOID string) (RevisionManifest, error) {
	key, err := gitUtils.DecodeOID(rootTreeOID)
	if err != nil {
		return RevisionManifest{}, err
	}

	var encoded []byte
	if err := engine.database.View(func(transaction *bbolt.Tx) error {
		value := transaction.Bucket(revisionsBucket).Get(key)
		if value == nil {
			return ErrRevisionNotFound
		}
		encoded = bytes.Clone(value)
		return nil
	}); err != nil {
		return RevisionManifest{}, err
	}

	return decodeRevisionManifest(encoded)
}

func (engine *SearchEngine) putRevisionManifest(rootTreeOID string, manifest RevisionManifest) error {
	key, err := gitUtils.DecodeOID(rootTreeOID)
	if err != nil {
		return err
	}
	encoded, err := encodeRevisionManifest(manifest)
	if err != nil {
		return err
	}

	return engine.database.Update(func(transaction *bbolt.Tx) error {
		bucket := transaction.Bucket(revisionsBucket)
		if bucket.Get(key) != nil {
			return nil
		}
		return bucket.Put(key, encoded)
	})
}

func encodeRevisionManifest(manifest RevisionManifest) ([]byte, error) {
	var buffer bytes.Buffer
	if err := gob.NewEncoder(&buffer).Encode(manifest); err != nil {
		return nil, fmt.Errorf("encode revision manifest: %w", err)
	}
	return buffer.Bytes(), nil
}

func decodeRevisionManifest(encoded []byte) (RevisionManifest, error) {
	decoder := gob.NewDecoder(bytes.NewReader(encoded))
	var manifest RevisionManifest
	if err := decoder.Decode(&manifest); err != nil {
		return RevisionManifest{}, fmt.Errorf("decode revision manifest: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return RevisionManifest{}, errors.New("revision manifest has trailing data")
		}
		return RevisionManifest{}, fmt.Errorf("decode trailing revision data: %w", err)
	}
	return manifest, nil
}
