package pebble

import (
	"context"
	"errors"
	"fmt"

	"github.com/cockroachdb/pebble"
	"github.com/nivekithan/archillery/apps/git-metadata-service/internal/git"
	gitUtils "github.com/nivekithan/archillery/apps/git-metadata-service/internal/git/utils"
	"github.com/nivekithan/archillery/apps/git-metadata-service/internal/search"
)

// Engine stores a repository's index in a Pebble database directory.
type Engine struct {
	repository *git.Repository
	database   *pebble.DB
	// Serialize indexing so ID allocation and manifest publication have one writer.
	writer chan struct{}
}

var _ search.SearchEngine = (*Engine)(nil)

func New(repository *git.Repository, databasePath string) (*Engine, error) {
	db, err := openDatabase(databasePath)
	if err != nil {
		return nil, err
	}
	return &Engine{repository: repository, database: db, writer: make(chan struct{}, 1)}, nil
}

// Close releases resources after all indexing calls have returned.
func (engine *Engine) Close() error { return engine.database.Close() }

func (engine *Engine) IndexRootTree(ctx context.Context, rootTreeOID string) error {
	if _, err := gitUtils.DecodeOID(rootTreeOID); err != nil {
		return err
	}

	select {
	case engine.writer <- struct{}{}:
		defer func() { <-engine.writer }()
	case <-ctx.Done():
		return ctx.Err()
	}

	if err := ctx.Err(); err != nil {
		return err
	}

	_, err := engine.getRevisionManifest(rootTreeOID)
	if err == nil {
		return nil
	}
	if !errors.Is(err, pebble.ErrNotFound) {
		return fmt.Errorf("read revision manifest: %w", err)
	}

	paths, err := engine.repository.TreePaths(ctx, rootTreeOID)
	if err != nil {
		return fmt.Errorf("list root tree: %w", err)
	}

	ids, err := engine.indexBlobs(ctx, paths)
	if err != nil {
		return fmt.Errorf("index blobs: %w", err)
	}

	manifest := RevisionManifest{Files: make([]RevisionFile, 0, len(paths))}
	for _, path := range paths {
		if path.Type != "blob" {
			continue
		}

		id, ok := ids[path.OID]
		if !ok {
			return fmt.Errorf("blob %s was not indexed", path.OID)
		}

		manifest.Files = append(manifest.Files, RevisionFile{Path: path.Path, BlobID: id})
	}

	if err := ctx.Err(); err != nil {
		return err
	}

	return engine.putRevisionManifest(rootTreeOID, manifest)
}
