package server

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

type gitRepository struct {
	path    string
	timeout time.Duration
}

func (r *gitRepository) defaultBranch(ctx context.Context) (string, error) {
	commandContext, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	output, err := exec.CommandContext(
		commandContext,
		"git",
		"--git-dir", r.path,
		"symbolic-ref", "--quiet", "--short", "HEAD",
	).Output()

	if err != nil {
		if commandContext.Err() != nil {
			return "", commandContext.Err()
		}
		return "", fmt.Errorf("read default branch: %w", err)
	}
	return strings.TrimSpace(string(output)), nil
}
