//go:build localllm

// LocalGGUFEmbedder provides embedding generation using local GGUF models.
//
// This embedder runs models directly within NornicDB using llama.cpp,
// eliminating the need for external services like Ollama.
//
// Features:
//   - GPU acceleration (CUDA/Metal) with CPU fallback
//   - Memory-mapped model loading for low memory footprint
//   - Thread-safe concurrent embedding generation
//
// Example:
//
//	config := &embed.Config{
//		Provider:   "local",
//		Model:      "bge-m3", // Resolves to /data/models/bge-m3.gguf
//		Dimensions: 1024,
//	}
//	embedder, err := embed.NewLocalGGUF(config)
//	if err != nil {
//		log.Fatal(err)
//	}
//	defer embedder.Close()
//
//	vec, err := embedder.Embed(ctx, "hello world")
package embed

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	"github.com/orneryd/nornicdb/pkg/localllm"
)

// LocalGGUFEmbedder implements Embedder using a local GGUF model via llama.cpp.
//
// This embedder provides GPU-accelerated embedding generation without
// external dependencies. Models are loaded from the configured models
// directory (default: /data/models/).
//
// Thread-safe: Can be used concurrently from multiple goroutines.
type LocalGGUFEmbedder struct {
	model     *localllm.Model
	modelName string
	modelPath string
}

// NewLocalGGUF creates an embedder using the existing Config pattern.
//
// Model resolution: config.Model → {NORNICDB_MODELS_DIR}/{model}.gguf
//
// Environment variables:
//   - NORNICDB_MODELS_DIR: Directory for .gguf files (default: /data/models)
//   - NORNICDB_EMBEDDING_GPU_LAYERS: GPU layer offload (-1=auto, 0=CPU, N=N layers)
//
// Example:
//
//	config := &embed.Config{
//		Provider:   "local",
//		Model:      "bge-m3",
//		Dimensions: 1024,
//	}
//	embedder, err := embed.NewLocalGGUF(config)
//	if err != nil {
//		// Model not found or failed to load
//		log.Fatal(err)
//	}
//	defer embedder.Close()
//
//	vec, _ := embedder.Embed(ctx, "semantic search")
//	fmt.Printf("Dimensions: %d\n", len(vec)) // 1024
func NewLocalGGUF(config *Config) (*LocalGGUFEmbedder, error) {
	// Resolve model path: model name → /data/models/{name}.gguf
	modelsDir := os.Getenv("NORNICDB_MODELS_DIR")
	if modelsDir == "" {
		modelsDir = "/data/models"
	}

	modelPath := filepath.Join(modelsDir, config.Model+".gguf")

	// Check if file exists
	if _, err := os.Stat(modelPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("model not found: %s (expected at %s)\n"+
			"  → Download a GGUF model (e.g., bge-m3) and place it in the models directory\n"+
			"  → Or set NORNICDB_MODELS_DIR to point to your models directory",
			config.Model, modelPath)
	}

	opts := localllm.DefaultOptions(modelPath)

	// Configure GPU layers from environment
	if gpuLayersStr := os.Getenv("NORNICDB_EMBEDDING_GPU_LAYERS"); gpuLayersStr != "" {
		if gpuLayers, err := strconv.Atoi(gpuLayersStr); err == nil {
			opts.GPULayers = gpuLayers
		}
	}

	model, err := localllm.LoadModel(opts)
	if err != nil {
		return nil, fmt.Errorf("failed to load model %s: %w", modelPath, err)
	}

	// Verify dimensions match if specified
	if config.Dimensions > 0 && model.Dimensions() != config.Dimensions {
		model.Close()
		return nil, fmt.Errorf("dimension mismatch: model has %d, config expects %d",
			model.Dimensions(), config.Dimensions)
	}

	return &LocalGGUFEmbedder{
		model:     model,
		modelName: config.Model,
		modelPath: modelPath,
	}, nil
}

// Embed generates a normalized embedding for the given text.
//
// The returned vector is L2-normalized, suitable for cosine similarity.
//
// Example:
//
//	vec, err := embedder.Embed(ctx, "graph database")
//	if err != nil {
//		return err
//	}
//	// Use vec for similarity search
func (e *LocalGGUFEmbedder) Embed(ctx context.Context, text string) ([]float32, error) {
	return e.model.Embed(ctx, text)
}

// EmbedBatch generates embeddings for multiple texts.
//
// Each text is processed sequentially. For high-throughput scenarios,
// consider using multiple embedder instances.
//
// Example:
//
//	texts := []string{"query 1", "query 2", "query 3"}
//	vecs, err := embedder.EmbedBatch(ctx, texts)
func (e *LocalGGUFEmbedder) EmbedBatch(ctx context.Context, texts []string) ([][]float32, error) {
	return e.model.EmbedBatch(ctx, texts)
}

// Dimensions returns the embedding vector dimension.
//
// Common values:
//   - BGE-M3: 1024
//   - E5-large: 1024
//   - Jina-v2-base-code: 768
func (e *LocalGGUFEmbedder) Dimensions() int {
	return e.model.Dimensions()
}

// Model returns the model name (without path or extension).
func (e *LocalGGUFEmbedder) Model() string {
	return e.modelName
}

// Close releases all resources associated with the embedder.
//
// After Close is called, the embedder must not be used.
func (e *LocalGGUFEmbedder) Close() error {
	return e.model.Close()
}
