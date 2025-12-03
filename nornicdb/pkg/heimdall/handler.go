package heimdall

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

// Handler provides HTTP endpoints for Bifrost chat.
// Uses standard HTTP/SSE - no external dependencies required.
// Bifrost is the rainbow bridge that connects to Heimdall.
//
// Endpoints:
//   - GET  /api/bifrost/status           - Heimdall and Bifrost status
//   - POST /api/bifrost/chat/completions - Chat with Heimdall
//   - GET  /api/bifrost/events           - SSE stream for real-time events
type Handler struct {
	manager  *Manager
	bifrost  *Bifrost
	config   Config
	database DatabaseReader
	metrics  MetricsReader
}

// NewHandler creates a Bifrost HTTP handler.
// Returns nil if Heimdall is disabled (manager is nil).
// Automatically creates Bifrost bridge when Heimdall is enabled.
func NewHandler(manager *Manager, cfg Config, db DatabaseReader, metrics MetricsReader) *Handler {
	if manager == nil {
		return nil
	}
	// Bifrost is automatically enabled when Heimdall is enabled
	bifrost := NewBifrost(cfg)
	return &Handler{
		manager:  manager,
		bifrost:  bifrost,
		config:   cfg,
		database: db,
		metrics:  metrics,
	}
}

// Bifrost returns the BifrostBridge for plugin communication.
// Returns NoOpBifrost if Bifrost is not available.
func (h *Handler) Bifrost() BifrostBridge {
	if h.bifrost == nil {
		return &NoOpBifrost{}
	}
	return h.bifrost
}

// ServeHTTP routes requests to appropriate handlers.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.URL.Path == "/api/bifrost/status":
		h.handleStatus(w, r)
	case r.URL.Path == "/api/bifrost/chat/completions":
		h.handleChatCompletions(w, r)
	case r.URL.Path == "/api/bifrost/events":
		h.handleEvents(w, r)
	default:
		http.NotFound(w, r)
	}
}

// handleStatus returns Heimdall status and stats.
// GET /api/bifrost/status
func (h *Handler) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	stats := h.manager.Stats()

	// Include Bifrost stats if available
	var bifrostStats map[string]interface{}
	if h.bifrost != nil {
		bifrostStats = h.bifrost.Stats()
	} else {
		bifrostStats = map[string]interface{}{
			"enabled":          false,
			"connection_count": 0,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok",
		"model":  h.config.Model,
		"heimdall": map[string]interface{}{
			"enabled": h.config.Enabled,
			"stats":   stats,
		},
		"bifrost": bifrostStats,
	})
}

// handleEvents provides an SSE stream for real-time Bifrost events.
// GET /api/bifrost/events
//
// This endpoint allows clients to receive real-time notifications, messages,
// and system events from Heimdall and its plugins.
func (h *Handler) handleEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Verify Bifrost is enabled
	if h.bifrost == nil {
		http.Error(w, "Bifrost not enabled", http.StatusServiceUnavailable)
		return
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // Disable nginx buffering

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	// Generate client ID
	clientID := generateID()

	// Register this connection with Bifrost
	h.bifrost.RegisterClient(clientID, w, flusher)
	defer h.bifrost.UnregisterClient(clientID)

	// Send initial connection message
	connMsg := BifrostMessage{
		Type:      "connected",
		Timestamp: time.Now().Unix(),
		Content:   "Connected to Bifrost",
		Data: map[string]interface{}{
			"client_id": clientID,
		},
	}
	data, _ := json.Marshal(connMsg)
	fmt.Fprintf(w, "data: %s\n\n", string(data))
	flusher.Flush()

	// Keep connection alive until client disconnects
	<-r.Context().Done()
}

// handleChatCompletions handles OpenAI-compatible chat completion requests via Bifrost.
// POST /api/bifrost/chat/completions
//
// Non-streaming returns JSON response.
// Streaming uses Server-Sent Events (SSE) - standard HTTP, no WebSocket needed.
func (h *Handler) handleChatCompletions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Default model if not specified (BYOM: only one model loaded)
	if req.Model == "" {
		req.Model = h.config.Model
	}

	// Inject action prompt as system message so SLM knows available actions
	// Only inject if not already present
	hasActionPrompt := false
	for _, msg := range req.Messages {
		if msg.Role == "system" && len(msg.Content) > 100 {
			hasActionPrompt = true
			break
		}
	}
	if !hasActionPrompt && HeimdallPluginsInitialized() {
		actionSystemPrompt := ChatMessage{
			Role: "system",
			Content: `You are the AI assistant for NornicDB graph database.
AVAILABLE ACTIONS:
` + ActionPrompt() + `

EXAMPLES - Translate user requests to JSON:

User: "what is the status" → {"action": "heimdall.watcher.status", "params": {}}
User: "show me metrics" → {"action": "heimdall.watcher.metrics", "params": {}}  
User: "database stats" → {"action": "heimdall.watcher.db_stats", "params": {}}
User: "how many nodes" → {"action": "heimdall.watcher.query", "params": {"cypher": "MATCH (n) RETURN count(n)"}}
`,
		}
		// Prepend system message
		req.Messages = append([]ChatMessage{actionSystemPrompt}, req.Messages...)
	}

	// Build prompt from messages
	prompt := BuildPrompt(req.Messages)

	// Generation params
	params := GenerateParams{
		MaxTokens:   req.MaxTokens,
		Temperature: req.Temperature,
		TopP:        req.TopP,
		TopK:        40,
		StopTokens:  []string{"<|im_end|>", "<|endoftext|>", "</s>"},
	}
	if params.MaxTokens == 0 {
		params.MaxTokens = h.config.MaxTokens
	}
	if params.Temperature == 0 {
		params.Temperature = h.config.Temperature
	}

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	if req.Stream {
		h.handleStreamingResponse(w, ctx, prompt, params, req.Model)
	} else {
		h.handleNonStreamingResponse(w, ctx, prompt, params, req.Model)
	}
}

// handleNonStreamingResponse generates complete response.
func (h *Handler) handleNonStreamingResponse(w http.ResponseWriter, ctx context.Context, prompt string, params GenerateParams, model string) {
	response, err := h.manager.Generate(ctx, prompt, params)
	if err != nil {
		http.Error(w, fmt.Sprintf("Generation error: %v", err), http.StatusInternalServerError)
		return
	}

	// Try to parse action command from response
	log.Printf("[Bifrost] SLM response: %s", response)
	finalResponse := response
	if parsedAction := h.tryParseAction(response); parsedAction != nil {
		log.Printf("[Bifrost] Action detected: %s with params: %v", parsedAction.Action, parsedAction.Params)
		// Execute the action
		actCtx := ActionContext{
			Context:     ctx,
			UserMessage: prompt,
			Params:      parsedAction.Params,
			Bifrost:     h.bifrost,
			Database:    h.database,
			Metrics:     h.metrics,
		}
		result, err := ExecuteAction(parsedAction.Action, actCtx)
		if err != nil {
			log.Printf("[Bifrost] Action execution failed: %v", err)
			finalResponse = fmt.Sprintf("Action failed: %v", err)
		} else if result != nil {
			log.Printf("[Bifrost] Action result: success=%v message=%s", result.Success, result.Message)
			// Format action result as response
			if result.Success {
				finalResponse = result.Message
				if result.Data != nil && len(result.Data) > 0 {
					dataJSON, _ := json.MarshalIndent(result.Data, "", "  ")
					finalResponse += "\n\n```json\n" + string(dataJSON) + "\n```"
				}
			} else {
				finalResponse = "Action failed: " + result.Message
			}
		}
	} else {
		log.Printf("[Bifrost] No action detected in response")
	}

	resp := ChatResponse{
		ID:      generateID(),
		Object:  "chat.completion", // OpenAI API compatible
		Model:   model,
		Created: time.Now().Unix(),
		Choices: []ChatChoice{
			{
				Index: 0,
				Message: &ChatMessage{
					Role:    "assistant",
					Content: finalResponse,
				},
				FinishReason: "stop",
			},
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// tryParseAction parses action JSON from SLM response.
// Format: {"action": "heimdall.watcher.status", "params": {}}
func (h *Handler) tryParseAction(response string) *ParsedAction {
	response = strings.TrimSpace(response)

	// Find JSON in response
	start := strings.Index(response, "{")
	if start == -1 {
		log.Printf("[Bifrost] tryParseAction: no JSON start found")
		return nil
	}
	end := strings.LastIndex(response, "}")
	if end == -1 || end <= start {
		log.Printf("[Bifrost] tryParseAction: no JSON end found")
		return nil
	}

	jsonStr := response[start : end+1]
	log.Printf("[Bifrost] tryParseAction: parsing JSON: %s", jsonStr)

	var parsed ParsedAction
	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		log.Printf("[Bifrost] tryParseAction: JSON parse error: %v", err)
		return nil
	}

	if parsed.Action == "" {
		log.Printf("[Bifrost] tryParseAction: no action field")
		return nil
	}

	log.Printf("[Bifrost] tryParseAction: looking up action: %s", parsed.Action)
	actions := ListHeimdallActions()
	log.Printf("[Bifrost] tryParseAction: registered actions: %v", actions)

	if _, ok := GetHeimdallAction(parsed.Action); !ok {
		log.Printf("[Bifrost] tryParseAction: action NOT FOUND: %s", parsed.Action)
		return nil
	}

	log.Printf("[Bifrost] tryParseAction: action FOUND: %s", parsed.Action)
	return &parsed
}

// handleStreamingResponse uses Server-Sent Events (SSE) for streaming.
// SSE is standard HTTP - works with any HTTP client, no WebSocket needed.
// After streaming completes, checks for action commands and executes them.
func (h *Handler) handleStreamingResponse(w http.ResponseWriter, ctx context.Context, prompt string, params GenerateParams, model string) {
	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // Disable nginx buffering

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	id := generateID()

	// Collect full response to check for actions
	var fullResponse strings.Builder

	// Stream tokens
	err := h.manager.GenerateStream(ctx, prompt, params, func(token string) error {
		fullResponse.WriteString(token)

		chunk := ChatResponse{
			ID:      id,
			Object:  "chat.completion.chunk", // OpenAI API streaming format
			Model:   model,
			Created: time.Now().Unix(),
			Choices: []ChatChoice{
				{
					Index: 0,
					Delta: &ChatMessage{
						Content: token,
					},
				},
			},
		}

		data, _ := json.Marshal(chunk)
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
		return nil
	})

	if err != nil {
		// Send error event
		fmt.Fprintf(w, "data: {\"error\": \"%s\"}\n\n", err.Error())
		flusher.Flush()
		return
	}

	// Check if response contains an action command
	response := fullResponse.String()
	log.Printf("[Bifrost] Streaming complete, checking for action: %s", response)

	if parsedAction := h.tryParseAction(response); parsedAction != nil {
		log.Printf("[Bifrost] Action detected in stream: %s", parsedAction.Action)

		// Execute the action
		actCtx := ActionContext{
			Context:     ctx,
			UserMessage: prompt,
			Params:      parsedAction.Params,
			Bifrost:     h.bifrost,
			Database:    h.database,
			Metrics:     h.metrics,
		}

		result, err := ExecuteAction(parsedAction.Action, actCtx)
		if err != nil {
			log.Printf("[Bifrost] Action execution failed: %v", err)
		} else if result != nil {
			log.Printf("[Bifrost] Action result: success=%v", result.Success)

			// Send action result as additional chunk
			var actionResponse string
			if result.Success {
				actionResponse = "\n\n" + result.Message
				if result.Data != nil && len(result.Data) > 0 {
					dataJSON, _ := json.MarshalIndent(result.Data, "", "  ")
					actionResponse += "\n\n```json\n" + string(dataJSON) + "\n```"
				}
			} else {
				actionResponse = "\n\nAction failed: " + result.Message
			}

			// Send action result chunk
			resultChunk := ChatResponse{
				ID:      id,
				Object:  "chat.completion.chunk",
				Model:   model,
				Created: time.Now().Unix(),
				Choices: []ChatChoice{
					{
						Index: 0,
						Delta: &ChatMessage{
							Content: actionResponse,
						},
					},
				},
			}
			data, _ := json.Marshal(resultChunk)
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		}
	}

	// Send final chunk with finish_reason (OpenAI format)
	doneChunk := ChatResponse{
		ID:      id,
		Object:  "chat.completion.chunk", // OpenAI API streaming format
		Model:   model,
		Created: time.Now().Unix(),
		Choices: []ChatChoice{
			{
				Index:        0,
				Delta:        &ChatMessage{},
				FinishReason: "stop",
			},
		},
	}
	data, _ := json.Marshal(doneChunk)
	fmt.Fprintf(w, "data: %s\n\n", data)
	// OpenAI sends [DONE] to signal stream end
	fmt.Fprintf(w, "data: [DONE]\n\n")
	flusher.Flush()
}
