package git

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

type commands struct {
	repositoryPath string
	timeout        time.Duration
}

type commandError struct {
	command string
	err     error
}

func (e *commandError) Error() string {
	return fmt.Sprintf("git %s: %v", e.command, e.err)
}

func (e *commandError) Unwrap() error {
	return e.err
}

func newCommands(repositoryPath string, timeout time.Duration) *commands {
	return &commands{repositoryPath: repositoryPath, timeout: timeout}
}

func (c *commands) defaultBranch(ctx context.Context) (string, error) {
	output, err := c.output(ctx, "symbolic-ref", "--quiet", "--short", "HEAD")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

func (c *commands) branches(ctx context.Context) ([]string, error) {
	output, err := c.output(ctx, "for-each-ref", "--format=%(refname:short)", "--sort=refname", "refs/heads")
	if err != nil {
		return nil, err
	}

	branches := make([]string, 0)
	for branch := range strings.SplitSeq(strings.TrimSpace(string(output)), "\n") {
		if branch != "" {
			branches = append(branches, branch)
		}
	}
	return branches, nil
}

func (c *commands) refExists(ctx context.Context, ref string) (bool, error) {
	_, err := c.output(ctx, "show-ref", "--verify", "--quiet", ref)
	if err == nil {
		return true, nil
	}

	if exitError, ok := errors.AsType[*exec.ExitError](err); ok && exitError.ExitCode() == 1 {
		return false, nil
	}
	return false, err
}

func (c *commands) revisionExists(ctx context.Context, revision string) (bool, error) {
	_, err := c.output(ctx, "rev-parse", "--verify", "--quiet", revision)
	if err == nil {
		return true, nil
	}

	if exitError, ok := errors.AsType[*exec.ExitError](err); ok && exitError.ExitCode() == 1 {
		return false, nil
	}
	return false, err
}

func (c *commands) tree(ctx context.Context, treeSpec, parentPath string) ([]TreeEntry, error) {
	output, err := c.output(ctx, "ls-tree", "-z", "-l", treeSpec)
	if err != nil {
		return nil, err
	}
	return parseTreeEntries(output, parentPath)
}

func (c *commands) commits(ctx context.Context, ref string, limit int) ([]Commit, error) {
	output, err := c.output(
		ctx,
		"log",
		"--max-count="+fmt.Sprint(limit),
		"--format=%H%x1f%h%x1f%s%x1f%an%x1f%ae%x1f%cI%x1e",
		ref,
	)
	if err != nil {
		return nil, err
	}
	return parseCommits(output)
}

func (c *commands) output(ctx context.Context, args ...string) ([]byte, error) {
	commandContext, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	commandArgs := append([]string{"--git-dir", c.repositoryPath}, args...)
	output, err := exec.CommandContext(commandContext, "git", commandArgs...).Output()
	if err != nil {
		if commandContext.Err() != nil {
			return nil, commandContext.Err()
		}
		return nil, &commandError{command: args[0], err: err}
	}
	return output, nil
}
