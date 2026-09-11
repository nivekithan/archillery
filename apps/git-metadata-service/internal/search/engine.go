package search

import "context"

// SearchEngine indexes immutable Git root trees.
type SearchEngine interface {
	IndexRootTree(ctx context.Context, rootTreeOID string) error
	// Close releases resources after all indexing calls have returned.
	Close() error
}
