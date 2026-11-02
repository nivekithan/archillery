package pebble

import (
	"encoding/binary"

	"github.com/cockroachdb/pebble"
)

// Each chunk is immutable after commit. IDs arrive in strictly increasing order:
// the serialized indexer allocates them monotonically and bigrams are unique per
// blob. The first varint is an absolute ID; subsequent varints are positive deltas.
type postingChunk struct {
	encoded []byte
	lastID  uint32
}

func (chunk *postingChunk) appendID(id uint32) {
	chunk.encoded = binary.AppendUvarint(chunk.encoded, uint64(id-chunk.lastID))
	chunk.lastID = id
}

func writePostingChunks(batch *pebble.Batch, chunks []postingChunk, batchLastID uint32) error {
	var key [7]byte
	key[0] = postingPrefix
	binary.BigEndian.PutUint32(key[3:], batchLastID)
	for gram, chunk := range chunks {
		if len(chunk.encoded) == 0 {
			continue
		}
		binary.BigEndian.PutUint16(key[1:3], uint16(gram))
		if err := batch.Set(key[:], chunk.encoded, nil); err != nil {
			return err
		}
	}
	return nil
}
