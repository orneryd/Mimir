// Package embed provides embedding generation clients for NornicDB.
package embed

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Embedder generates vector embeddings from text.
type Embedder interface {
	// Embed generates embedding for single text
	Embed(ctx context.Context, text string) ([]float32, error)

	// EmbedBatch generates embeddings for multiple texts
	EmbedBatch(ctx context.Context, texts []string) ([][]float32, error)

	// Dimensions returns the embedding vector dimension
	Dimensions() int

	// Model returns the model name
	Model() string
}

// Config holds embedder configuration.
type Config struct {
	Provider   string        // ollama, openai
	APIURL     string        // e.g., http://localhost:11434
	APIPath    string        // e.g., /api/embeddings or /v1/embeddings
	APIKey     string        // For OpenAI
	Model      string        // e.g., mxbai-embed-large
	Dimensions int           // Expected dimensions (for validation)
	Timeout    time.Duration // Request timeout
}

// DefaultOllamaConfig returns config for local Ollama.
func DefaultOllamaConfig() *Config {
	return &Config{
		Provider:   "ollama",
		APIURL:     "http://localhost:11434",
		APIPath:    "/api/embeddings",
		Model:      "mxbai-embed-large",
		Dimensions: 1024,
		Timeout:    30 * time.Second,
	}
}

// DefaultOpenAIConfig returns config for OpenAI.
func DefaultOpenAIConfig(apiKey string) *Config {
	return &Config{
		Provider:   "openai",
		APIURL:     "https://api.openai.com",
		APIPath:    "/v1/embeddings",
		APIKey:     apiKey,
		Model:      "text-embedding-3-small",
		Dimensions: 1536,
		Timeout:    30 * time.Second,
	}
}

// OllamaEmbedder implements Embedder for Ollama.
type OllamaEmbedder struct {
	config *Config
	client *http.Client
}

// NewOllama creates a new Ollama embedder.
func NewOllama(config *Config) *OllamaEmbedder {
	if config == nil {
		config = DefaultOllamaConfig()
	}

	return &OllamaEmbedder{
		config: config,
		client: &http.Client{
			Timeout: config.Timeout,
		},
	}
}

// ollamaRequest is the request format for Ollama.
type ollamaRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
}

// ollamaResponse is the response format from Ollama.
type ollamaResponse struct {
	Embedding []float32 `json:"embedding"`
}

// Embed generates embedding for single text.
func (e *OllamaEmbedder) Embed(ctx context.Context, text string) ([]float32, error) {
	req := ollamaRequest{
		Model:  e.config.Model,
		Prompt: text,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := e.config.APIURL + e.config.APIPath
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := e.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ollama returned %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var ollamaResp ollamaResponse
	if err := json.NewDecoder(resp.Body).Decode(&ollamaResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return ollamaResp.Embedding, nil
}

// EmbedBatch generates embeddings for multiple texts.
func (e *OllamaEmbedder) EmbedBatch(ctx context.Context, texts []string) ([][]float32, error) {
	results := make([][]float32, len(texts))
	for i, text := range texts {
		embedding, err := e.Embed(ctx, text)
		if err != nil {
			return nil, fmt.Errorf("failed to embed text %d: %w", i, err)
		}
		results[i] = embedding
	}
	return results, nil
}

// Dimensions returns the expected embedding dimensions.
func (e *OllamaEmbedder) Dimensions() int {
	return e.config.Dimensions
}

// Model returns the model name.
func (e *OllamaEmbedder) Model() string {
	return e.config.Model
}

// OpenAIEmbedder implements Embedder for OpenAI.
type OpenAIEmbedder struct {
	config *Config
	client *http.Client
}

// NewOpenAI creates a new OpenAI embedder.
func NewOpenAI(config *Config) *OpenAIEmbedder {
	if config == nil {
		config = DefaultOpenAIConfig("")
	}

	return &OpenAIEmbedder{
		config: config,
		client: &http.Client{
			Timeout: config.Timeout,
		},
	}
}

// openaiRequest is the request format for OpenAI.
type openaiRequest struct {
	Model string   `json:"model"`
	Input []string `json:"input"`
}

// openaiResponse is the response format from OpenAI.
type openaiResponse struct {
	Data []struct {
		Embedding []float32 `json:"embedding"`
		Index     int       `json:"index"`
	} `json:"data"`
}

// Embed generates embedding for single text.
func (e *OpenAIEmbedder) Embed(ctx context.Context, text string) ([]float32, error) {
	embeddings, err := e.EmbedBatch(ctx, []string{text})
	if err != nil {
		return nil, err
	}
	if len(embeddings) == 0 {
		return nil, fmt.Errorf("no embedding returned")
	}
	return embeddings[0], nil
}

// EmbedBatch generates embeddings for multiple texts.
func (e *OpenAIEmbedder) EmbedBatch(ctx context.Context, texts []string) ([][]float32, error) {
	req := openaiRequest{
		Model: e.config.Model,
		Input: texts,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := e.config.APIURL + e.config.APIPath
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+e.config.APIKey)

	resp, err := e.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("openai returned %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var openaiResp openaiResponse
	if err := json.NewDecoder(resp.Body).Decode(&openaiResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	results := make([][]float32, len(openaiResp.Data))
	for _, data := range openaiResp.Data {
		results[data.Index] = data.Embedding
	}

	return results, nil
}

// Dimensions returns the expected embedding dimensions.
func (e *OpenAIEmbedder) Dimensions() int {
	return e.config.Dimensions
}

// Model returns the model name.
func (e *OpenAIEmbedder) Model() string {
	return e.config.Model
}

// NewEmbedder creates an embedder based on provider.
func NewEmbedder(config *Config) (Embedder, error) {
	switch config.Provider {
	case "ollama":
		return NewOllama(config), nil
	case "openai":
		if config.APIKey == "" {
			return nil, fmt.Errorf("OpenAI requires an API key")
		}
		return NewOpenAI(config), nil
	default:
		return nil, fmt.Errorf("unknown provider: %s", config.Provider)
	}
}
