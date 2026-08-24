package git

import (
	"context"
	"errors"
	"fmt"
	pathpkg "path"
	"strings"
	"sync"
	"time"
)

var (
	ErrBranchNotFound = errors.New("branch not found")
	ErrCommitNotFound = errors.New("commit not found")
	ErrInvalidPath    = errors.New("invalid path")
	ErrInvalidRef     = errors.New("invalid ref")
	ErrTreeNotFound   = errors.New("tree not found")
)

type Repository struct {
	commands *commands
}

func NewRepository(path string, timeout time.Duration) *Repository {
	return &Repository{commands: newCommands(path, timeout)}
}

func (r *Repository) DefaultBranch(ctx context.Context) (string, error) {
	defaultBranch, err := r.commands.defaultBranch(ctx)
	if err != nil {
		return "", fmt.Errorf("read default branch: %w", err)
	}
	return defaultBranch, nil
}

func (r *Repository) Branches(ctx context.Context, defaultBranch string) ([]string, error) {
	listedBranches, err := r.commands.branches(ctx)
	if err != nil {
		return nil, fmt.Errorf("list branches: %w", err)
	}

	branches := make([]string, 0)
	foundDefault := false
	for _, branch := range listedBranches {
		if branch == defaultBranch {
			foundDefault = true
		} else {
			branches = append(branches, branch)
		}
	}
	if !foundDefault {
		return nil, fmt.Errorf("default branch not found: %s", defaultBranch)
	}
	return append([]string{defaultBranch}, branches...), nil
}

func (r *Repository) Commits(ctx context.Context, branch, commit string, limit int) ([]Commit, error) {
	ref, err := r.revisionRef(ctx, branch, commit)
	if err != nil {
		return nil, err
	}
	commits, err := r.commands.commits(ctx, ref, limit)
	if err != nil {
		return nil, fmt.Errorf("list commits: %w", err)
	}
	return commits, nil
}

type RepositorySummary struct {
	LatestCommit Commit `json:"latestCommit"`
	TotalCommits int64  `json:"totalCommits"`
}

func (r *Repository) Summary(ctx context.Context, branch, commit string) (RepositorySummary, error) {
	ref, err := r.revisionRef(ctx, branch, commit)
	if err != nil {
		return RepositorySummary{}, err
	}

	var commits []Commit
	var commitsErr error
	var totalCommits int64
	var totalCommitsErr error
	var waitGroup sync.WaitGroup
	waitGroup.Go(func() {
		commits, commitsErr = r.commands.commits(ctx, ref, 1)
	})
	waitGroup.Go(func() {
		totalCommits, totalCommitsErr = r.commands.commitCount(ctx, ref)
	})
	waitGroup.Wait()

	if commitsErr != nil {
		return RepositorySummary{}, fmt.Errorf("read latest commit: %w", commitsErr)
	}
	if len(commits) != 1 {
		return RepositorySummary{}, errors.New("latest commit not found")
	}
	if totalCommitsErr != nil {
		return RepositorySummary{}, fmt.Errorf("count commits: %w", totalCommitsErr)
	}
	return RepositorySummary{
		LatestCommit: commits[0],
		TotalCommits: totalCommits,
	}, nil
}

func (r *Repository) Tree(ctx context.Context, branch, commit, treePath string) ([]TreeEntry, error) {
	if err := validateTreePath(treePath); err != nil {
		return nil, err
	}
	ref, err := r.revisionRef(ctx, branch, commit)
	if err != nil {
		return nil, err
	}

	treeSpec := ref + "^{tree}"
	if treePath != "" {
		treeSpec = ref + ":" + treePath
	}
	entries, err := r.commands.tree(ctx, treeSpec, treePath)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return nil, err
		}
		if _, ok := errors.AsType[*commandError](err); ok {
			return nil, fmt.Errorf("%w: %s", ErrTreeNotFound, treePath)
		}
		return nil, err
	}
	return entries, nil
}

func (r *Repository) revisionRef(ctx context.Context, branch, commit string) (string, error) {
	if branch != "" && commit != "" {
		return "", ErrInvalidRef
	}
	if commit == "" {
		return r.branchRef(ctx, branch)
	}
	if !isCommitHash(commit) {
		return "", ErrInvalidRef
	}

	exists, err := r.commands.revisionExists(ctx, commit+"^{commit}")
	if err != nil {
		return "", err
	}
	if !exists {
		return "", fmt.Errorf("%w: %s", ErrCommitNotFound, commit)
	}
	return commit, nil
}

func (r *Repository) branchRef(ctx context.Context, branch string) (string, error) {
	if branch == "" {
		return "HEAD", nil
	}
	ref := "refs/heads/" + branch
	exists, err := r.commands.refExists(ctx, ref)
	if err != nil {
		return "", err
	}
	if !exists {
		return "", fmt.Errorf("%w: %s", ErrBranchNotFound, branch)
	}
	return ref, nil
}

func isCommitHash(value string) bool {
	if len(value) != 40 {
		return false
	}
	for _, character := range value {
		if !strings.ContainsRune("0123456789abcdefABCDEF", character) {
			return false
		}
	}
	return true
}

func validateTreePath(value string) error {
	if strings.ContainsRune(value, '\x00') || strings.HasPrefix(value, "/") {
		return ErrInvalidPath
	}
	if value != "" && (pathpkg.Clean(value) != value || value == ".") {
		return ErrInvalidPath
	}
	return nil
}
