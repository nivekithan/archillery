package git

import (
	"bytes"
	"fmt"
	pathpkg "path"
	"strconv"
)

type TreeEntry struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Type string `json:"type"`
	Size *int64 `json:"size,omitempty"`
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
