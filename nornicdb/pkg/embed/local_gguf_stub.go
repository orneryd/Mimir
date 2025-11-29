//go:build !localllm

package embed

import (
	"context"
	"errors"
)

// LocalGGUFEmbedder is a stub for when localllm build tag is not set.
// Build with -tags=localllm to enable local GGUF embedding support.
type LocalGGUFEmbedder struct{}

var errLocalLLMNotBuilt = errors.New("local GGUF embeddings not available: build with -tags=localllm and llama.cpp library")

// NewLocalGGUF returns an error when localllm is not built in.
// To enable local GGUF embedding support:
//  1. Build llama.cpp: ./scripts/build-llama.sh
//  2. Build with tag: go build -tags=localllm ./cmd/nornicdb
func NewLocalGGUF(config *Config) (*LocalGGUFEmbedder, error) {
	return nil, errLocalLLMNotBuilt
}

// Embed returns an error (stub).
func (e *LocalGGUFEmbedder) Embed(ctx context.Context, text string) ([]float32, error) {
	return nil, errLocalLLMNotBuilt
}

// EmbedBatch returns an error (stub).
func (e *LocalGGUFEmbedder) EmbedBatch(ctx context.Context, texts []string) ([][]float32, error) {
	return nil, errLocalLLMNotBuilt
}

// Dimensions returns 0 (stub).
func (e *LocalGGUFEmbedder) Dimensions() int {
	return 0
}

// Model returns empty string (stub).
func (e *LocalGGUFEmbedder) Model() string {
	return ""
}

// Close is a no-op (stub).
func (e *LocalGGUFEmbedder) Close() error {
	return nil
}
