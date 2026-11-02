package pebble

import (
	"bytes"
	"encoding/gob"
	"errors"
	"io"

	"github.com/cockroachdb/pebble"
	gitUtils "github.com/nivekithan/archillery/apps/git-metadata-service/internal/git/utils"
)

type RevisionFile struct {
	Path   string
	BlobID uint32
}

type RevisionManifest struct{ Files []RevisionFile }

func (engine *Engine) getRevisionManifest(oid string) (RevisionManifest, error) {
	var manifest RevisionManifest
	raw, err := gitUtils.DecodeOID(oid)
	if err != nil {
		return manifest, err
	}
	value, err := readValue(engine.database, recordKey(revisionPrefix, raw))
	if err != nil {
		return manifest, err
	}
	decoder := gob.NewDecoder(bytes.NewReader(value))
	if err := decoder.Decode(&manifest); err != nil {
		return RevisionManifest{}, err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return RevisionManifest{}, errors.New("revision manifest has trailing data")
	}
	return manifest, nil
}

func (engine *Engine) putRevisionManifest(oid string, manifest RevisionManifest) error {
	raw, err := gitUtils.DecodeOID(oid)
	if err != nil {
		return err
	}
	var buffer bytes.Buffer
	if err := gob.NewEncoder(&buffer).Encode(manifest); err != nil {
		return err
	}
	return engine.database.Set(recordKey(revisionPrefix, raw), buffer.Bytes(), pebble.Sync)
}
