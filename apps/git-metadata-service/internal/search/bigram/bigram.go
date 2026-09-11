package bigram

import "unicode/utf8"

func Normalized(content []byte) []uint16 {
	normalized := make([]byte, 0, len(content))
	for _, value := range content {
		if value >= 'A' && value <= 'Z' {
			value += 'a' - 'A'
		}
		if isHorizontalWhitespace(value) {
			if len(normalized) > 0 && normalized[len(normalized)-1] == ' ' {
				continue
			}
			value = ' '
		}
		normalized = append(normalized, value)
	}
	return uniqueBigrams(normalized)
}

func uniqueBigrams(content []byte) []uint16 {
	if len(content) < 2 {
		return nil
	}
	seen := make([]bool, 1<<16)
	bigrams := make([]uint16, 0, min(len(content)-1, 1<<16))
	for index := 0; index+1 < len(content); index++ {
		if !indexableBigram(content[index], content[index+1]) {
			continue
		}
		bigram := uint16(content[index])<<8 | uint16(content[index+1])
		if !seen[bigram] {
			seen[bigram] = true
			bigrams = append(bigrams, bigram)
		}
	}
	return bigrams
}

func indexableBigram(left, right byte) bool {
	return left < utf8.RuneSelf &&
		right < utf8.RuneSelf &&
		left != '\n' && left != '\r' &&
		right != '\n' && right != '\r'
}

func isHorizontalWhitespace(value byte) bool {
	return value == ' ' || value == '\t' || value == '\v' || value == '\f'
}
