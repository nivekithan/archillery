package git

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	pathpkg "path"
	"strings"
	"time"
)

var (
	ErrInvalidPath  = errors.New("invalid path")
	ErrTreeNotFound = errors.New("tree not found")
)

type Repository struct {
	path    string
	timeout time.Duration
}

func NewRepository(path string, timeout time.Duration) *Repository {
	return &Repository{path: path, timeout: timeout}
}

func (r *Repository) DefaultBranch(ctx context.Context) (string, error) {
	output, err := r.output(ctx, "symbolic-ref", "--quiet", "--short", "HEAD")
	if err != nil {
		return "", fmt.Errorf("read default branch: %w", err)
	}
	return strings.TrimSpace(string(output)), nil
}

func (r *Repository) Tree(ctx context.Context, treePath string) ([]TreeEntry, error) {
	if err := validateTreePath(treePath); err != nil {
		return nil, err
	}

	treeSpec := "HEAD^{tree}"
	if treePath != "" {
		treeSpec = "HEAD:" + treePath
	}
	output, err := r.output(ctx, "ls-tree", "-z", "-l", treeSpec)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return nil, err
		}
		return nil, fmt.Errorf("%w: %s", ErrTreeNotFound, treePath)
	}
	return parseTreeEntries(output, treePath)
}

func (r *Repository) output(ctx context.Context, args ...string) ([]byte, error) {
	commandContext, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	commandArgs := append([]string{"--git-dir", r.path}, args...)
	output, err := exec.CommandContext(commandContext, "git", commandArgs...).Output()
	if err != nil {
		if commandContext.Err() != nil {
			return nil, commandContext.Err()
		}
		return nil, fmt.Errorf("git %s: %w", args[0], err)
	}
	return output, nil
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
