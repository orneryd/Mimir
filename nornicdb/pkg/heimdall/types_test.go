package heimdall

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()

	assert.False(t, cfg.Enabled, "Should be disabled by default")
	assert.Empty(t, cfg.ModelsDir, "ModelsDir empty - reads NORNICDB_MODELS_DIR at runtime")
	assert.Equal(t, "qwen2.5-0.5b-instruct", cfg.Model)
	assert.Equal(t, 512, cfg.MaxTokens)
	assert.Equal(t, float32(0.1), cfg.Temperature)
	assert.Equal(t, -1, cfg.GPULayers, "Should be auto (-1) by default")
	assert.True(t, cfg.AnomalyDetection)
	assert.True(t, cfg.RuntimeDiagnosis)
	assert.False(t, cfg.MemoryCuration, "Memory curation should be off by default")
}

func TestDefaultGenerateParams(t *testing.T) {
	params := DefaultGenerateParams()

	assert.Equal(t, 512, params.MaxTokens)
	assert.Equal(t, float32(0.1), params.Temperature)
	assert.Equal(t, float32(0.9), params.TopP)
	assert.Equal(t, 40, params.TopK)
	assert.Contains(t, params.StopTokens, "<|im_end|>")
}

func TestBuildPrompt(t *testing.T) {
	tests := []struct {
		name     string
		messages []ChatMessage
		want     string
	}{
		{
			name:     "empty messages",
			messages: []ChatMessage{},
			want:     "<|im_start|>assistant\n",
		},
		{
			name: "system message only",
			messages: []ChatMessage{
				{Role: "system", Content: "You are a helpful assistant."},
			},
			want: "<|im_start|>system\nYou are a helpful assistant.<|im_end|>\n<|im_start|>assistant\n",
		},
		{
			name: "user message only",
			messages: []ChatMessage{
				{Role: "user", Content: "Hello"},
			},
			want: "<|im_start|>user\nHello<|im_end|>\n<|im_start|>assistant\n",
		},
		{
			name: "full conversation",
			messages: []ChatMessage{
				{Role: "system", Content: "You are Heimdall."},
				{Role: "user", Content: "Check health"},
				{Role: "assistant", Content: "All systems operational."},
				{Role: "user", Content: "Thanks"},
			},
			want: "<|im_start|>system\nYou are Heimdall.<|im_end|>\n" +
				"<|im_start|>user\nCheck health<|im_end|>\n" +
				"<|im_start|>assistant\nAll systems operational.<|im_end|>\n" +
				"<|im_start|>user\nThanks<|im_end|>\n" +
				"<|im_start|>assistant\n",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := BuildPrompt(tt.messages)
			assert.Equal(t, tt.want, got)
		})
	}
}

// MockFeatureFlags implements FeatureFlagsSource for testing
type MockFeatureFlags struct {
	enabled          bool
	model            string
	gpuLayers        int
	maxTokens        int
	temperature      float32
	anomalyDetection bool
	runtimeDiagnosis bool
	memoryCuration   bool
}

func (m *MockFeatureFlags) GetHeimdallEnabled() bool          { return m.enabled }
func (m *MockFeatureFlags) GetHeimdallModel() string          { return m.model }
func (m *MockFeatureFlags) GetHeimdallGPULayers() int         { return m.gpuLayers }
func (m *MockFeatureFlags) GetHeimdallMaxTokens() int         { return m.maxTokens }
func (m *MockFeatureFlags) GetHeimdallTemperature() float32   { return m.temperature }
func (m *MockFeatureFlags) GetHeimdallAnomalyDetection() bool { return m.anomalyDetection }
func (m *MockFeatureFlags) GetHeimdallRuntimeDiagnosis() bool { return m.runtimeDiagnosis }
func (m *MockFeatureFlags) GetHeimdallMemoryCuration() bool   { return m.memoryCuration }

func TestConfigFromFeatureFlags(t *testing.T) {
	flags := &MockFeatureFlags{
		enabled:          true,
		model:            "test-model",
		gpuLayers:        8,
		maxTokens:        1024,
		temperature:      0.7,
		anomalyDetection: true,
		runtimeDiagnosis: false,
		memoryCuration:   true,
	}

	cfg := ConfigFromFeatureFlags(flags)

	assert.True(t, cfg.Enabled)
	assert.Equal(t, "test-model", cfg.Model)
	assert.Equal(t, 8, cfg.GPULayers)
	assert.Equal(t, 1024, cfg.MaxTokens)
	assert.Equal(t, float32(0.7), cfg.Temperature)
	assert.True(t, cfg.AnomalyDetection)
	assert.False(t, cfg.RuntimeDiagnosis)
	assert.True(t, cfg.MemoryCuration)
	// ModelsDir is empty - scheduler reads NORNICDB_MODELS_DIR directly
	assert.Empty(t, cfg.ModelsDir)
}

func TestConfigFromFeatureFlagsModelsDir(t *testing.T) {
	flags := &MockFeatureFlags{
		enabled: true,
		model:   "test-model",
	}

	cfg := ConfigFromFeatureFlags(flags)

	// ModelsDir should be empty - scheduler reads env var directly
	// This ensures ONE model directory for both embedder and Heimdall
	assert.Empty(t, cfg.ModelsDir)
}

func TestChatRequest(t *testing.T) {
	req := ChatRequest{
		Model: "qwen2.5-0.5b",
		Messages: []ChatMessage{
			{Role: "user", Content: "Hello"},
		},
		Stream:      true,
		MaxTokens:   256,
		Temperature: 0.5,
	}

	assert.Equal(t, "qwen2.5-0.5b", req.Model)
	assert.Len(t, req.Messages, 1)
	assert.True(t, req.Stream)
	assert.Equal(t, 256, req.MaxTokens)
	assert.Equal(t, float32(0.5), req.Temperature)
}

func TestChatResponse(t *testing.T) {
	resp := ChatResponse{
		ID:      "chat-123",
		Model:   "qwen2.5-0.5b",
		Created: 1234567890,
		Choices: []ChatChoice{
			{
				Index: 0,
				Message: &ChatMessage{
					Role:    "assistant",
					Content: "Hello! How can I help?",
				},
				FinishReason: "stop",
			},
		},
		Usage: &ChatUsage{
			PromptTokens:     10,
			CompletionTokens: 5,
			TotalTokens:      15,
		},
	}

	require.Len(t, resp.Choices, 1)
	assert.Equal(t, "assistant", resp.Choices[0].Message.Role)
	assert.Equal(t, 15, resp.Usage.TotalTokens)
}

func TestModelType(t *testing.T) {
	assert.Equal(t, ModelType("embedding"), ModelTypeEmbedding)
	assert.Equal(t, ModelType("reasoning"), ModelTypeReasoning)
	assert.Equal(t, ModelType("classification"), ModelTypeClassification)
}

func TestActionOpcode(t *testing.T) {
	// Verify opcodes are distinct
	opcodes := []ActionOpcode{
		ActionNone,
		ActionLogInfo,
		ActionLogWarning,
		ActionLogError,
		ActionThrottleQuery,
		ActionSuggestIndex,
		ActionMergeNodes,
		ActionRestartWorkerPool,
		ActionClearQueue,
		ActionTriggerGC,
		ActionReduceConcurrency,
	}

	seen := make(map[ActionOpcode]bool)
	for _, op := range opcodes {
		assert.False(t, seen[op], "Duplicate opcode: %d", op)
		seen[op] = true
	}
}
