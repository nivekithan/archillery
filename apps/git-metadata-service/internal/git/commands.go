package git

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strconv"
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

func (c *commands) recursiveTree(ctx context.Context, ref string) ([]recursiveTreeEntry, error) {
	output, err := c.output(
		ctx,
		"ls-tree",
		"-r",
		"-t",
		"-l",
		"-z",
		"--full-tree",
		ref,
	)
	if err != nil {
		return nil, err
	}
	return parseRecursiveTree(output)
}

func (c *commands) resolveCommit(ctx context.Context, ref string) (string, error) {
	output, err := c.output(ctx, "rev-parse", "--verify", ref+"^{commit}")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

func (c *commands) rootTree(ctx context.Context, commit string) (string, error) {
	output, err := c.output(ctx, "rev-parse", "--verify", commit+"^{tree}")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

func (c *commands) blob(ctx context.Context, blobSpec string) ([]byte, error) {
	return c.output(ctx, "cat-file", "blob", blobSpec)
}

func (c *commands) visitBlobs(ctx context.Context, oids []string, visit func(Blob) error) error {
	commandArgs := append([]string{"--git-dir", c.repositoryPath}, "cat-file", "--batch-command")
	command := exec.CommandContext(ctx, "git", commandArgs...)
	stdin, err := command.StdinPipe()
	if err != nil {
		return fmt.Errorf("open git cat-file stdin: %w", err)
	}
	stdout, err := command.StdoutPipe()
	if err != nil {
		return fmt.Errorf("open git cat-file stdout: %w", err)
	}
	if err := command.Start(); err != nil {
		return fmt.Errorf("start git cat-file: %w", err)
	}

	reader := bufio.NewReader(stdout)
	seen := make(map[string]struct{}, len(oids))
	var visitErr error
	for _, oid := range oids {
		if _, ok := seen[oid]; ok {
			continue
		}
		seen[oid] = struct{}{}
		if !isCommitHash(oid) {
			visitErr = fmt.Errorf("invalid blob object ID: %q", oid)
			break
		}
		if _, err := fmt.Fprintf(stdin, "contents %s\n", oid); err != nil {
			visitErr = fmt.Errorf("request blob %s: %w", oid, err)
			break
		}
		header, err := reader.ReadString('\n')
		if err != nil {
			visitErr = fmt.Errorf("read blob %s header: %w", oid, err)
			break
		}
		fields := strings.Fields(header)
		if len(fields) == 2 && fields[1] == "missing" {
			visitErr = fmt.Errorf("blob missing: %s", oid)
			break
		}
		if len(fields) != 3 || fields[1] != "blob" || !strings.EqualFold(fields[0], oid) {
			visitErr = fmt.Errorf("unexpected blob header for %s: %q", oid, strings.TrimSpace(header))
			break
		}
		size, err := strconv.ParseInt(fields[2], 10, 64)
		if err != nil || size < 0 || size > int64(int(^uint(0)>>1)) {
			visitErr = fmt.Errorf("invalid blob size for %s: %q", oid, fields[2])
			break
		}
		content := make([]byte, int(size))
		if _, err := io.ReadFull(reader, content); err != nil {
			visitErr = fmt.Errorf("read blob %s: %w", oid, err)
			break
		}
		terminator, err := reader.ReadByte()
		if err != nil || terminator != '\n' {
			visitErr = fmt.Errorf("read blob %s terminator", oid)
			break
		}
		if err := visit(Blob{OID: oid, Content: content}); err != nil {
			visitErr = err
			break
		}
	}

	_ = stdin.Close()
	if visitErr != nil {
		_ = command.Process.Kill()
	}
	waitErr := command.Wait()
	if visitErr != nil {
		return visitErr
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if waitErr != nil {
		return fmt.Errorf("git cat-file: %w", waitErr)
	}
	return nil
}

func (c *commands) objectType(ctx context.Context, objectSpec string) (string, error) {
	output, err := c.output(ctx, "cat-file", "-t", objectSpec)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
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

func (c *commands) commitCount(ctx context.Context, ref string) (int64, error) {
	output, err := c.output(ctx, "rev-list", "--count", ref)
	if err != nil {
		return 0, err
	}
	count, err := strconv.ParseInt(strings.TrimSpace(string(output)), 10, 64)
	if err != nil {
		return 0, fmt.Errorf("parse commit count: %w", err)
	}
	return count, nil
}

func (c *commands) commitParents(ctx context.Context, ref string) ([]string, error) {
	output, err := c.output(ctx, "show", "--no-patch", "--format=%P", ref)
	if err != nil {
		return nil, err
	}
	return strings.Fields(string(output)), nil
}

func (c *commands) commitPatch(ctx context.Context, ref string) ([]byte, error) {
	return c.output(
		ctx,
		"show",
		"--format=",
		"--first-parent",
		"--find-renames",
		"--find-copies",
		"--no-ext-diff",
		"--no-color",
		"--patch",
		"--unified=3",
		ref,
	)
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
