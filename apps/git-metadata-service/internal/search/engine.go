package search

import (
	"errors"
	"fmt"

	"github.com/nivekithan/archillery/apps/git-metadata-service/internal/git"
	"go.etcd.io/bbolt"
)

type SearchEngine struct {
	repository *git.Repository
	database   *bbolt.DB
}

func NewSearchEngine(repository *git.Repository, databasePath string) (*SearchEngine, error) {
	database, err := openDatabase(databasePath)
	if err != nil {
		return nil, err
	}

	return &SearchEngine{repository: repository, database: database}, nil
}

func (engine *SearchEngine) Close() error {
	return engine.database.Close()
}

func (engine *SearchEngine) indexRootTree(rootTreeOID string) error {
	_, err := engine.getRevisionManifest(rootTreeOID)
	if err == nil {
		return nil
	}
	if !errors.Is(err, ErrRevisionNotFound) {
		return fmt.Errorf("read revision manifest for %s: %w", rootTreeOID, err)
	}

	return errors.New("root tree indexing is not implemented")
}
