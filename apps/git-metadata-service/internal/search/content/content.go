package content

import (
	"bytes"
	"unicode/utf8"
)

const MaxBlobSize = int64(2 << 20)

func Searchable(data []byte) bool {
	return bytes.IndexByte(data, 0) < 0 && utf8.Valid(data)
}
