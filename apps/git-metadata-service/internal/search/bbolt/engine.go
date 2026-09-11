package bbolt

import (
	"context"
	"errors"
	"fmt"

	"github.com/nivekithan/archillery/apps/git-metadata-service/internal/git"
	"github.com/nivekithan/archillery/apps/git-metadata-service/internal/search"
	"go.etcd.io/bbolt"
)

type Engine struct {
	repository *git.Repository
	database   *bbolt.DB
	blobs      chan addBlobRequest
	writerDone chan struct{}
}

var _ search.SearchEngine = (*Engine)(nil)

func New(repository *git.Repository, databasePath string) (*Engine, error) {
	database, err := openDatabase(databasePath)
	if err != nil {
		return nil, err
	}

	engine := &Engine{
		repository: repository,
		database:   database,
		blobs:      make(chan addBlobRequest),
		writerDone: make(chan struct{}),
	}
	go engine.writeBlobs()
	return engine, nil
}

func (engine *Engine) Close() error {
	close(engine.blobs)
	<-engine.writerDone
	return engine.database.Close()
}

func (engine *Engine) IndexRootTree(ctx context.Context, rootTreeOID string) error {
	_, err := engine.getRevisionManifest(rootTreeOID)
	if err == nil {
		return nil
	}
	if !errors.Is(err, ErrRevisionNotFound) {
		return fmt.Errorf("read revision manifest for %s: %w", rootTreeOID, err)
	}

	paths, err := engine.repository.TreePaths(ctx, rootTreeOID)
	if err != nil {
		return fmt.Errorf("list root tree %s: %w", rootTreeOID, err)
	}
	blobIDs, err := engine.indexBlobs(ctx, paths)
	if err != nil {
		return fmt.Errorf("index root tree %s: %w", rootTreeOID, err)
	}

	manifest := RevisionManifest{Files: make([]RevisionFile, 0, len(paths))}
	for _, path := range paths {
		if path.Type != "blob" {
			continue
		}
		blobID, found := blobIDs[path.OID]
		if !found {
			return fmt.Errorf("blob %s was not indexed", path.OID)
		}
		manifest.Files = append(manifest.Files, RevisionFile{Path: path.Path, BlobID: blobID})
	}
	if err := engine.putRevisionManifest(rootTreeOID, manifest); err != nil {
		return fmt.Errorf("publish revision manifest: %w", err)
	}
	return nil
}
