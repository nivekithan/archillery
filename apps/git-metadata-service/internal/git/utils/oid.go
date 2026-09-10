package utils

import (
	"encoding/hex"
	"fmt"
)

const oidSize = 20

func DecodeOID(value string) ([]byte, error) {
	if len(value) != hex.EncodedLen(oidSize) {
		return nil, fmt.Errorf("object ID must contain 40 hexadecimal characters")
	}
	decoded, err := hex.DecodeString(value)
	if err != nil {
		return nil, fmt.Errorf("decode object ID: %w", err)
	}
	return decoded, nil
}
