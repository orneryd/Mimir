package heimdall

import (
	"context"
	"testing"

	"github.com/orneryd/nornicdb/pkg/heimdall"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// helper to create ActionContext
func newActionCtx(params map[string]interface{}) heimdall.ActionContext {
	return heimdall.ActionContext{
		Context: context.Background(),
		Params:  params,
		Bifrost: &heimdall.NoOpBifrost{},
	}
}

// TestWatcherPlugin_Interface verifies plugin implements HeimdallPlugin
func TestWatcherPlugin_Interface(t *testing.T) {
	var _ heimdall.HeimdallPlugin = &WatcherPlugin{}
}

// TestWatcherPlugin_Identity tests identity methods
func TestWatcherPlugin_Identity(t *testing.T) {
	p := &WatcherPlugin{}

	assert.Equal(t, "watcher", p.Name())
	assert.Equal(t, "1.0.0", p.Version())
	assert.Equal(t, heimdall.PluginTypeHeimdall, p.Type())
	assert.Contains(t, p.Description(), "Watcher")
}

// TestWatcherPlugin_Lifecycle tests the full lifecycle
func TestWatcherPlugin_Lifecycle(t *testing.T) {
	p := &WatcherPlugin{}

	// Initialize
	ctx := heimdall.SubsystemContext{
		Config: heimdall.Config{
			Model:       "test-model",
			MaxTokens:   512,
			Temperature: 0.1,
		},
	}
	err := p.Initialize(ctx)
	require.NoError(t, err)
	assert.Equal(t, heimdall.StatusReady, p.Status())

	// Start
	err = p.Start()
	require.NoError(t, err)
	assert.Equal(t, heimdall.StatusRunning, p.Status())

	// Check health
	health := p.Health()
	assert.True(t, health.Healthy)
	assert.Equal(t, heimdall.StatusRunning, health.Status)

	// Stop
	err = p.Stop()
	require.NoError(t, err)
	assert.Equal(t, heimdall.StatusStopped, p.Status())

	// Shutdown
	err = p.Shutdown()
	require.NoError(t, err)
	assert.Equal(t, heimdall.StatusUninitialized, p.Status())
}

// TestWatcherPlugin_Actions tests that all actions are registered
func TestWatcherPlugin_Actions(t *testing.T) {
	p := &WatcherPlugin{}
	actions := p.Actions()

	expectedActions := []string{
		"hello",      // Hello World test action
		"status",     // Get status
		"health",     // Check health
		"config",     // Get config
		"set_config", // Set config
		"metrics",    // Get metrics
		"events",     // Get events
		"broadcast",  // Broadcast message
		"notify",     // Send notification
	}

	for _, name := range expectedActions {
		t.Run(name, func(t *testing.T) {
			action, ok := actions[name]
			assert.True(t, ok, "Action %s should be registered", name)
			assert.NotEmpty(t, action.Description)
			assert.NotEmpty(t, action.Category)
			assert.NotNil(t, action.Handler)
		})
	}
}

// TestWatcherPlugin_HelloAction tests the hello action specifically
func TestWatcherPlugin_HelloAction(t *testing.T) {
	p := &WatcherPlugin{}

	// Initialize plugin
	ctx := heimdall.SubsystemContext{
		Config: heimdall.Config{
			Model:       "test-model",
			MaxTokens:   512,
			Temperature: 0.1,
		},
	}
	require.NoError(t, p.Initialize(ctx))
	require.NoError(t, p.Start())

	t.Run("default greeting", func(t *testing.T) {
		actionCtx := newActionCtx(map[string]interface{}{})

		result, err := p.actionHello(actionCtx)
		require.NoError(t, err)
		require.NotNil(t, result)

		assert.True(t, result.Success)
		assert.Contains(t, result.Message, "Hello, World!")
		assert.Contains(t, result.Message, "Heimdall is operational")

		// Check data fields
		assert.NotNil(t, result.Data)
		assert.NotEmpty(t, result.Data["greeting"])
		assert.NotEmpty(t, result.Data["timestamp"])
		assert.Equal(t, "test-model", result.Data["model"])
		assert.Equal(t, "running", result.Data["status"])
	})

	t.Run("custom name", func(t *testing.T) {
		actionCtx := newActionCtx(map[string]interface{}{
			"name": "NornicDB",
		})

		result, err := p.actionHello(actionCtx)
		require.NoError(t, err)
		require.NotNil(t, result)

		assert.True(t, result.Success)
		assert.Contains(t, result.Message, "Hello, NornicDB!")
	})
}

// TestWatcherPlugin_StatusAction tests the status action
func TestWatcherPlugin_StatusAction(t *testing.T) {
	p := &WatcherPlugin{}

	ctx := heimdall.SubsystemContext{
		Config: heimdall.Config{
			Model:       "qwen2.5-0.5b",
			MaxTokens:   512,
			Temperature: 0.1,
		},
	}
	require.NoError(t, p.Initialize(ctx))
	require.NoError(t, p.Start())

	actionCtx := newActionCtx(map[string]interface{}{})

	result, err := p.actionStatus(actionCtx)
	require.NoError(t, err)
	require.NotNil(t, result)

	assert.True(t, result.Success)
	assert.Contains(t, result.Message, "NornicDB Status")

	// Check nested heimdall data
	heimdallData, ok := result.Data["heimdall"].(map[string]interface{})
	require.True(t, ok, "result.Data should have heimdall key")
	assert.NotNil(t, heimdallData["health"])
	assert.NotNil(t, heimdallData["metrics"])
	assert.NotNil(t, heimdallData["config"])

	// Check runtime data is present
	assert.NotNil(t, result.Data["runtime"])
}

// TestWatcherPlugin_MetricsAction tests the metrics action
func TestWatcherPlugin_MetricsAction(t *testing.T) {
	p := &WatcherPlugin{}

	ctx := heimdall.SubsystemContext{
		Config: heimdall.Config{
			Model: "test-model",
		},
	}
	require.NoError(t, p.Initialize(ctx))
	require.NoError(t, p.Start())

	// Make some requests to generate metrics
	for i := 0; i < 5; i++ {
		actionCtx := newActionCtx(map[string]interface{}{})
		_, _ = p.actionHello(actionCtx)
	}

	actionCtx := newActionCtx(map[string]interface{}{})

	result, err := p.actionMetrics(actionCtx)
	require.NoError(t, err)
	require.NotNil(t, result)

	assert.True(t, result.Success)
	assert.Contains(t, result.Message, "NornicDB Metrics")

	// Check heimdall metrics are present
	heimdallMetrics, ok := result.Data["heimdall"].(map[string]interface{})
	require.True(t, ok, "result.Data should have heimdall key")
	requests, ok := heimdallMetrics["requests"].(int64)
	require.True(t, ok, "heimdall metrics should have requests")
	assert.GreaterOrEqual(t, requests, int64(5))

	// Check runtime metrics are present
	assert.NotNil(t, result.Data["runtime"])
}

// TestWatcherPlugin_EventsAction tests the events action
func TestWatcherPlugin_EventsAction(t *testing.T) {
	p := &WatcherPlugin{}

	ctx := heimdall.SubsystemContext{
		Config: heimdall.Config{
			Model: "test-model",
		},
	}
	require.NoError(t, p.Initialize(ctx))
	require.NoError(t, p.Start())

	// Generate some events via hello action
	for i := 0; i < 3; i++ {
		actionCtx := newActionCtx(map[string]interface{}{})
		_, _ = p.actionHello(actionCtx)
	}

	actionCtx := newActionCtx(map[string]interface{}{
		"limit": 10,
	})

	result, err := p.actionEvents(actionCtx)
	require.NoError(t, err)
	require.NotNil(t, result)

	assert.True(t, result.Success)
	events := result.Data["events"].([]heimdall.SubsystemEvent)
	assert.NotEmpty(t, events)
}

// TestWatcherPlugin_ConfigureAction tests the set_config action
func TestWatcherPlugin_ConfigureAction(t *testing.T) {
	p := &WatcherPlugin{}

	ctx := heimdall.SubsystemContext{
		Config: heimdall.Config{
			Model:       "test-model",
			MaxTokens:   512,
			Temperature: 0.1,
		},
	}
	require.NoError(t, p.Initialize(ctx))
	require.NoError(t, p.Start())

	t.Run("valid config update", func(t *testing.T) {
		actionCtx := newActionCtx(map[string]interface{}{
			"max_tokens": 1024,
		})

		result, err := p.actionSetConfig(actionCtx)
		require.NoError(t, err)
		assert.True(t, result.Success)

		// Verify config was updated
		config := p.Config()
		assert.Equal(t, 1024, config["max_tokens"])
	})

	t.Run("invalid config value", func(t *testing.T) {
		actionCtx := newActionCtx(map[string]interface{}{
			"max_tokens": 10000, // Too high
		})

		result, err := p.actionSetConfig(actionCtx)
		require.NoError(t, err) // Handler doesn't return error, sets Success=false
		assert.False(t, result.Success)
		assert.Contains(t, result.Message, "error")
	})
}

// TestWatcherPlugin_BroadcastAction tests the broadcast action
func TestWatcherPlugin_BroadcastAction(t *testing.T) {
	p := &WatcherPlugin{}

	ctx := heimdall.SubsystemContext{
		Config: heimdall.Config{
			Model: "test-model",
		},
	}
	require.NoError(t, p.Initialize(ctx))
	require.NoError(t, p.Start())

	t.Run("with message", func(t *testing.T) {
		actionCtx := newActionCtx(map[string]interface{}{
			"message": "Test broadcast message",
		})

		result, err := p.actionBroadcast(actionCtx)
		require.NoError(t, err)
		assert.True(t, result.Success)
		assert.Contains(t, result.Message, "broadcast")
	})

	t.Run("missing message", func(t *testing.T) {
		actionCtx := newActionCtx(map[string]interface{}{})

		result, err := p.actionBroadcast(actionCtx)
		require.NoError(t, err)
		assert.False(t, result.Success)
		assert.Contains(t, result.Message, "Missing")
	})
}

// TestWatcherPlugin_NotifyAction tests the notify action
func TestWatcherPlugin_NotifyAction(t *testing.T) {
	p := &WatcherPlugin{}

	ctx := heimdall.SubsystemContext{
		Config: heimdall.Config{
			Model: "test-model",
		},
	}
	require.NoError(t, p.Initialize(ctx))
	require.NoError(t, p.Start())

	t.Run("full notification", func(t *testing.T) {
		actionCtx := newActionCtx(map[string]interface{}{
			"type":    "success",
			"title":   "Test Title",
			"message": "Test notification message",
		})

		result, err := p.actionNotify(actionCtx)
		require.NoError(t, err)
		assert.True(t, result.Success)
		assert.Equal(t, "success", result.Data["type"])
		assert.Equal(t, "Test Title", result.Data["title"])
	})

	t.Run("missing message", func(t *testing.T) {
		actionCtx := newActionCtx(map[string]interface{}{
			"type":  "error",
			"title": "Error",
		})

		result, err := p.actionNotify(actionCtx)
		require.NoError(t, err)
		assert.False(t, result.Success)
		assert.Contains(t, result.Message, "Missing")
	})
}

// TestWatcherPlugin_Concurrency tests thread safety
func TestWatcherPlugin_Concurrency(t *testing.T) {
	p := &WatcherPlugin{}

	ctx := heimdall.SubsystemContext{
		Config: heimdall.Config{
			Model: "test-model",
		},
	}
	require.NoError(t, p.Initialize(ctx))
	require.NoError(t, p.Start())

	// Run concurrent requests
	done := make(chan bool)
	for i := 0; i < 10; i++ {
		go func() {
			for j := 0; j < 100; j++ {
				actionCtx := newActionCtx(map[string]interface{}{})
				_, _ = p.actionHello(actionCtx)
			}
			done <- true
		}()
	}

	// Wait for all goroutines
	for i := 0; i < 10; i++ {
		<-done
	}

	// Verify metrics are consistent
	metrics := p.Metrics()
	assert.GreaterOrEqual(t, metrics["requests"].(int64), int64(1000))
}
