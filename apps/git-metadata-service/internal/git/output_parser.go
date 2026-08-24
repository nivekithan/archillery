package git

import (
	"bytes"
	"fmt"
	pathpkg "path"
	"sort"
	"strconv"
	"strings"
)

type TreeEntry struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Type string `json:"type"`
	Size *int64 `json:"size,omitempty"`
}

type Commit struct {
	Hash        string `json:"hash"`
	ShortHash   string `json:"shortHash"`
	Message     string `json:"message"`
	AuthorName  string `json:"authorName"`
	AuthorEmail string `json:"authorEmail"`
	CommittedAt string `json:"committedAt"`
}

func parseCommits(output []byte) ([]Commit, error) {
	commits := make([]Commit, 0)
	for record := range bytes.SplitSeq(output, []byte{0x1e}) {
		record = bytes.TrimSpace(record)
		if len(record) == 0 {
			continue
		}
		fields := strings.Split(string(record), string(rune(0x1f)))
		if len(fields) != 6 {
			return nil, fmt.Errorf("parse commit: unexpected git output")
		}
		commits = append(commits, Commit{
			Hash:        fields[0],
			ShortHash:   fields[1],
			Message:     fields[2],
			AuthorName:  strings.ToLower(fields[3]),
			AuthorEmail: fields[4],
			CommittedAt: fields[5],
		})
	}
	return commits, nil
}

func parseTreeEntries(output []byte, parentPath string) ([]TreeEntry, error) {
	entries := make([]TreeEntry, 0)
	for _, record := range bytes.Split(output, []byte{0}) {
		if len(record) == 0 {
			continue
		}
		parts := bytes.SplitN(record, []byte{'\t'}, 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("parse tree entry: unexpected git output")
		}
		metadata := bytes.Fields(parts[0])
		if len(metadata) != 4 {
			return nil, fmt.Errorf("parse tree entry: unexpected metadata")
		}

		name := string(parts[1])
		entry := TreeEntry{
			Name: name,
			Path: pathpkg.Join(parentPath, name),
			Type: treeEntryType(string(metadata[0]), string(metadata[1])),
		}
		if string(metadata[3]) != "-" {
			size, err := strconv.ParseInt(string(metadata[3]), 10, 64)
			if err != nil {
				return nil, fmt.Errorf("parse tree entry size: %w", err)
			}
			entry.Size = &size
		}
		entries = append(entries, entry)
	}
	sort.Slice(entries, func(i, j int) bool {
		leftDirectory := entries[i].Type == "tree"
		rightDirectory := entries[j].Type == "tree"
		if leftDirectory != rightDirectory {
			return leftDirectory
		}
		return entries[i].Name < entries[j].Name
	})
	return entries, nil
}

func treeEntryType(mode, objectType string) string {
	switch mode {
	case "040000":
		return "tree"
	case "120000":
		return "symlink"
	case "160000":
		return "submodule"
	default:
		return objectType
	}
}
