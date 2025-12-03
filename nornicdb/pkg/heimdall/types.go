// Package heimdall provides Heimdall - the cognitive guardian for NornicDB.
//
// Heimdall enables NornicDB to run reasoning SLMs alongside embedding models
// for cognitive database capabilities including anomaly detection, runtime diagnosis,
// and memory curation.
//
// The Heimdall subsystem uses standard protocols:
//   - WebSocket (WSS) for real-time streaming chat
//   - Server-Sent Events (SSE) as fallback
//   - JSON message format (OpenAI-compatible)
//   - JWT authentication from existing auth system
package heimdall

import (
	"context"
	"time"
)

// ModelType categorizes models by their purpose.
type ModelType string

const (
	ModelTypeEmbedding      ModelType = "embedding"
	ModelTypeReasoning      ModelType = "reasoning"
	ModelTypeClassification ModelType = "classification"
)

// ModelInfo describes an available model in the registry.
type ModelInfo struct {
	Name         string    `json:"name"`
	Path         string    `json:"path"`
	Type         ModelType `json:"type"`
	SizeBytes    int64     `json:"size_bytes"`
	Quantization string    `json:"quantization,omitempty"`
	Loaded       bool      `json:"loaded"`
	LastUsed     time.Time `json:"last_used,omitempty"`
	VRAMEstimate int64     `json:"vram_estimate_bytes"`
}

// ChatMessage represents a message in the chat format (OpenAI-compatible).
type ChatMessage struct {
	Role    string `json:"role"` // "system", "user", "assistant"
	Content string `json:"content"`
}

// ChatRequest is the request format for chat completions.
// Compatible with OpenAI/Ollama API format.
type ChatRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	Stream      bool          `json:"stream,omitempty"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
	Temperature float32       `json:"temperature,omitempty"`
	TopP        float32       `json:"top_p,omitempty"`
}

// ChatResponse is the response format for chat completions.
// Fully OpenAI API compatible.
type ChatResponse struct {
	ID      string       `json:"id"`
	Object  string       `json:"object"` // "chat.completion" or "chat.completion.chunk"
	Model   string       `json:"model"`
	Created int64        `json:"created"`
	Choices []ChatChoice `json:"choices"`
	Usage   *ChatUsage   `json:"usage,omitempty"`
}

// ChatChoice represents a single completion choice.
type ChatChoice struct {
	Index        int          `json:"index"`
	Message      *ChatMessage `json:"message,omitempty"`
	Delta        *ChatMessage `json:"delta,omitempty"` // For streaming
	FinishReason string       `json:"finish_reason,omitempty"`
}

// ChatUsage tracks token usage.
type ChatUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// StreamEvent represents a Server-Sent Event for streaming.
type StreamEvent struct {
	Event string `json:"event,omitempty"` // "message", "done", "error"
	Data  string `json:"data"`
}

// GenerateParams configures text generation.
type GenerateParams struct {
	MaxTokens   int
	Temperature float32
	TopP        float32
	TopK        int
	StopTokens  []string
}

// DefaultGenerateParams returns sensible defaults for structured output.
func DefaultGenerateParams() GenerateParams {
	return GenerateParams{
		MaxTokens:   512,
		Temperature: 0.1, // Low for deterministic JSON output
		TopP:        0.9,
		TopK:        40,
		StopTokens:  []string{"<|im_end|>", "<|endoftext|>", "</s>"},
	}
}

// Generator is the interface for text generation models.
type Generator interface {
	// Generate produces a complete response.
	Generate(ctx context.Context, prompt string, params GenerateParams) (string, error)

	// GenerateStream produces tokens via callback.
	GenerateStream(ctx context.Context, prompt string, params GenerateParams, callback func(token string) error) error

	// Close releases model resources.
	Close() error

	// ModelPath returns the loaded model path.
	ModelPath() string
}

// ActionOpcode represents bounded actions the SLM can recommend.
// All SLM outputs map to these predefined actions for safety.
type ActionOpcode int

const (
	ActionNone ActionOpcode = iota
	ActionLogInfo
	ActionLogWarning
	ActionLogError
	ActionThrottleQuery
	ActionSuggestIndex
	ActionMergeNodes
	ActionRestartWorkerPool
	ActionClearQueue
	ActionTriggerGC
	ActionReduceConcurrency
)

// ActionResponse is the structured output format for SLM recommendations.
type ActionResponse struct {
	Action     ActionOpcode   `json:"action"`
	Confidence float64        `json:"confidence"`
	Reasoning  string         `json:"reasoning"`
	Params     map[string]any `json:"params,omitempty"`
}

// Config holds SLM subsystem configuration.
type Config struct {
	// Enabled controls whether Heimdall (the cognitive guardian) is active.
	// When enabled, Bifrost (the chat interface) is automatically enabled.
	// Default: false (opt-in feature)
	Enabled bool `json:"enabled"`

	// BifrostEnabled controls the Bifrost chat interface.
	// Automatically set to true when Heimdall is enabled.
	// Cannot be enabled independently - Bifrost requires Heimdall.
	BifrostEnabled bool `json:"bifrost_enabled"`

	ModelsDir   string  `json:"models_dir"`
	Model       string  `json:"model"`
	MaxTokens   int     `json:"max_tokens"`
	Temperature float32 `json:"temperature"`
	GPULayers   int     `json:"gpu_layers"`

	// Feature toggles
	AnomalyDetection bool          `json:"anomaly_detection"`
	AnomalyInterval  time.Duration `json:"anomaly_interval"`
	RuntimeDiagnosis bool          `json:"runtime_diagnosis"`
	RuntimeInterval  time.Duration `json:"runtime_interval"`
	MemoryCuration   bool          `json:"memory_curation"`
	CurationInterval time.Duration `json:"curation_interval"`
}

// DefaultConfig returns sensible defaults.
// Heimdall is disabled by default (opt-in feature).
// When Heimdall is enabled, Bifrost is automatically enabled.
func DefaultConfig() Config {
	return Config{
		Enabled:          false, // Heimdall disabled by default (opt-in)
		BifrostEnabled:   false, // Bifrost follows Heimdall state
		ModelsDir:        "",    // Empty = use NORNICDB_MODELS_DIR env var
		Model:            "qwen2.5-0.5b-instruct",
		MaxTokens:        512,
		Temperature:      0.1,
		GPULayers:        -1, // Auto
		AnomalyDetection: true,
		AnomalyInterval:  5 * time.Minute,
		RuntimeDiagnosis: true,
		RuntimeInterval:  1 * time.Minute,
		MemoryCuration:   false, // Experimental
		CurationInterval: 1 * time.Hour,
	}
}

// FeatureFlagsSource is the interface for getting Heimdall config from feature flags.
// This avoids import cycles with the config package.
type FeatureFlagsSource interface {
	GetHeimdallEnabled() bool
	GetHeimdallModel() string
	GetHeimdallGPULayers() int
	GetHeimdallMaxTokens() int
	GetHeimdallTemperature() float32
	GetHeimdallAnomalyDetection() bool
	GetHeimdallRuntimeDiagnosis() bool
	GetHeimdallMemoryCuration() bool
}

// ConfigFromFeatureFlags creates Heimdall config from feature flags.
// This is the preferred way to create Config - respects BYOM settings.
//
// Key behavior:
//   - When Heimdall is enabled, Bifrost is automatically enabled
//   - Bifrost cannot be enabled independently (requires Heimdall)
//   - Heimdall is disabled by default (opt-in feature)
//   - Uses NORNICDB_MODELS_DIR for model location (same as embedder)
func ConfigFromFeatureFlags(flags FeatureFlagsSource) Config {
	cfg := DefaultConfig()
	cfg.Enabled = flags.GetHeimdallEnabled()
	// Bifrost is automatically enabled when Heimdall is enabled
	// Bifrost (the chat interface) requires Heimdall (the SLM) to function
	cfg.BifrostEnabled = cfg.Enabled
	cfg.Model = flags.GetHeimdallModel()
	cfg.GPULayers = flags.GetHeimdallGPULayers()
	cfg.MaxTokens = flags.GetHeimdallMaxTokens()
	cfg.Temperature = flags.GetHeimdallTemperature()
	cfg.AnomalyDetection = flags.GetHeimdallAnomalyDetection()
	cfg.RuntimeDiagnosis = flags.GetHeimdallRuntimeDiagnosis()
	cfg.MemoryCuration = flags.GetHeimdallMemoryCuration()
	// ModelsDir stays empty - scheduler reads NORNICDB_MODELS_DIR directly
	// This ensures ONE model directory for both embedder and Heimdall
	return cfg
}

// BuildPrompt converts chat messages to a prompt string.
// Uses ChatML format for instruction-tuned models.
func BuildPrompt(messages []ChatMessage) string {
	var prompt string
	for _, msg := range messages {
		switch msg.Role {
		case "system":
			prompt += "<|im_start|>system\n" + msg.Content + "<|im_end|>\n"
		case "user":
			prompt += "<|im_start|>user\n" + msg.Content + "<|im_end|>\n"
		case "assistant":
			prompt += "<|im_start|>assistant\n" + msg.Content + "<|im_end|>\n"
		}
	}
	// Prompt for assistant response
	prompt += "<|im_start|>assistant\n"
	return prompt
}
