# Heimdall Plugin Development Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Plugin Interface](#plugin-interface)
5. [Action Handlers](#action-handlers)
6. [Building and Loading Plugins](#building-and-loading-plugins)
7. [Testing Plugins](#testing-plugins)
8. [Example: Complete Plugin](#example-complete-plugin)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Overview

Heimdall is the cognitive guardian of NornicDB - a subsystem that enables AI-powered database management through an embedded Small Language Model (SLM). Named after the Norse god who guards Bifröst with his all-seeing eye, Heimdall watches over NornicDB's cognitive capabilities.

**Heimdall Plugins** are a DISTINCT plugin type from regular NornicDB plugins (like APOC). While regular plugins provide Cypher functions, Heimdall plugins provide **subsystem management actions** that the SLM can invoke based on natural language user requests.

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│  User: "Check for graph anomalies"                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Bifrost (Chat Interface)                                       │
│  └─ Sends message to Heimdall SLM                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Heimdall SLM (Qwen2.5-0.5B)                                    │
│  ├─ Receives system prompt with available actions               │
│  ├─ Interprets user intent                                      │
│  └─ Responds: {"action": "heimdall.anomaly.detect", "params": {}}│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Action Invoker                                                 │
│  ├─ Parses JSON action command                                  │
│  ├─ Looks up handler in SubsystemManager                        │
│  └─ Executes: heimdall.anomaly.detect handler                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Anomaly Plugin (Your Plugin!)                                  │
│  └─ Executes detection logic, returns ActionResult              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  User sees: "Found 3 anomalies: [details...]"                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### Plugin Types

| Plugin Type | Interface | Purpose | Example |
|-------------|-----------|---------|---------|
| Regular (APOC) | `nornicdb.Plugin` | Cypher functions | `apoc.coll.sum()` |
| **Heimdall** | `heimdall.HeimdallPlugin` | SLM-managed subsystems | `heimdall.anomaly.detect` |

### Key Components

1. **SubsystemManager**: Global registry for all Heimdall plugins and actions
2. **HeimdallPlugin Interface**: Contract all plugins must implement
3. **ActionFunc**: Individual action definitions with handlers
4. **ActionContext**: Context passed to handlers (database, metrics, Bifrost)
5. **ActionResult**: Standardized return format for actions
6. **BifrostBridge**: Communication channel to connected UI clients

---

## Quick Start

### 1. Define Your Plugin

```go
package myplugin

import (
    "github.com/orneryd/nornicdb/pkg/heimdall"
)

// MyPlugin implements heimdall.HeimdallPlugin
type MyPlugin struct {
    // Your plugin state
}

// Export as HeimdallPlugin - REQUIRED for .so plugins
var Plugin heimdall.HeimdallPlugin = &MyPlugin{}
```

### 2. Implement Required Methods

```go
// Identity
func (p *MyPlugin) Name() string        { return "myplugin" }
func (p *MyPlugin) Version() string     { return "1.0.0" }
func (p *MyPlugin) Type() string        { return "heimdall" } // MUST be "heimdall"
func (p *MyPlugin) Description() string { return "My custom subsystem" }
```

### 3. Define Actions

```go
func (p *MyPlugin) Actions() map[string]heimdall.ActionFunc {
    return map[string]heimdall.ActionFunc{
        "analyze": {
            Description: "Analyze something in the graph",
            Category:    "analysis",
            Handler:     p.handleAnalyze,
        },
    }
}

func (p *MyPlugin) handleAnalyze(ctx heimdall.ActionContext) (*heimdall.ActionResult, error) {
    // Your logic here
    return &heimdall.ActionResult{
        Success: true,
        Message: "Analysis complete",
        Data:    map[string]interface{}{"findings": []string{"item1", "item2"}},
    }, nil
}
```

### 4. Build and Deploy

```bash
# Build as shared library
go build -buildmode=plugin -o myplugin.so ./plugins/myplugin

# Place in plugins directory
cp myplugin.so $NORNICDB_HEIMDALL_PLUGINS_DIR/

# Or register as built-in (see below)
```

---

## Plugin Interface

Every Heimdall plugin must implement the `HeimdallPlugin` interface:

```go
type HeimdallPlugin interface {
    // === Identity ===
    Name() string        // Plugin/subsystem identifier (e.g., "anomaly")
    Version() string     // Semver version (e.g., "1.0.0")
    Type() string        // MUST return "heimdall"
    Description() string // Human-readable description

    // === Lifecycle ===
    Initialize(ctx SubsystemContext) error  // Called on load
    Start() error                           // Begin background operations
    Stop() error                            // Pause background operations
    Shutdown() error                        // Final cleanup

    // === State & Health ===
    Status() SubsystemStatus                // Current status
    Health() SubsystemHealth                // Detailed health
    Metrics() map[string]interface{}        // Subsystem metrics

    // === Configuration ===
    Config() map[string]interface{}                    // Current config
    Configure(settings map[string]interface{}) error   // Update config
    ConfigSchema() map[string]interface{}              // JSON schema for validation

    // === Actions ===
    Actions() map[string]ActionFunc         // All available actions

    // === Data Access ===
    Summary() string                        // Text summary for SLM context
    RecentEvents(limit int) []SubsystemEvent // Recent events
}
```

### SubsystemContext

Provided during initialization:

```go
type SubsystemContext struct {
    Config   Config          // Heimdall configuration
    Database DatabaseReader  // Read-only database access
    Metrics  MetricsReader   // Runtime metrics
    Logger   SubsystemLogger // Logging interface
    Bifrost  BifrostBridge   // Communication to UI clients
}
```

### SubsystemStatus Values

```go
const (
    StatusUninitialized SubsystemStatus = "uninitialized"
    StatusInitializing  SubsystemStatus = "initializing"
    StatusReady         SubsystemStatus = "ready"
    StatusRunning       SubsystemStatus = "running"
    StatusStopping      SubsystemStatus = "stopping"
    StatusStopped       SubsystemStatus = "stopped"
    StatusError         SubsystemStatus = "error"
)
```

---

## Action Handlers

Actions are the heart of Heimdall plugins - they define what the SLM can do.

### ActionFunc Structure

```go
type ActionFunc struct {
    Name        string                                         // Auto-set: heimdall.{plugin}.{action}
    Handler     func(ctx ActionContext) (*ActionResult, error) // Your handler
    Description string                                         // Shown to SLM/users
    Category    string                                         // Grouping (monitoring, analysis, etc.)
}
```

### ActionContext

Passed to every handler:

```go
type ActionContext struct {
    context.Context                        // Standard Go context

    UserMessage string                     // Original user request
    Params      map[string]interface{}     // Extracted parameters

    Database    DatabaseReader             // Query the graph
    Metrics     MetricsReader              // Get runtime metrics
    Bifrost     BifrostBridge              // Communicate with UI
}
```

### ActionResult

Standard response format:

```go
type ActionResult struct {
    Success bool                   `json:"success"`
    Message string                 `json:"message"`
    Data    map[string]interface{} `json:"data,omitempty"`
}
```

### Example Handler

```go
func (p *MyPlugin) handleDetect(ctx heimdall.ActionContext) (*heimdall.ActionResult, error) {
    // 1. Parse parameters
    threshold := 0.8
    if t, ok := ctx.Params["threshold"].(float64); ok {
        threshold = t
    }

    // 2. Query the database
    results, err := ctx.Database.Query(ctx, `
        MATCH (n)
        WHERE n.score > $threshold
        RETURN n.id, n.score
    `, map[string]interface{}{"threshold": threshold})
    if err != nil {
        return nil, fmt.Errorf("query failed: %w", err)
    }

    // 3. Send progress via Bifrost (optional)
    if ctx.Bifrost.IsConnected() {
        ctx.Bifrost.SendNotification("info", "Scan Progress", "Found potential anomalies...")
    }

    // 4. Return result
    return &heimdall.ActionResult{
        Success: true,
        Message: fmt.Sprintf("Found %d items above threshold %.2f", len(results), threshold),
        Data: map[string]interface{}{
            "count":     len(results),
            "threshold": threshold,
            "items":     results,
        },
    }, nil
}
```

---

## Building and Loading Plugins

### Method 1: External .so Plugin

```bash
# Build
cd plugins/myplugin
go build -buildmode=plugin -o myplugin.so .

# Deploy
export NORNICDB_HEIMDALL_PLUGINS_DIR=/path/to/plugins
cp myplugin.so $NORNICDB_HEIMDALL_PLUGINS_DIR/
```

**Requirements for .so plugins:**
- Must export `var Plugin heimdall.HeimdallPlugin = &YourType{}`
- Built with same Go version as NornicDB
- Same CGO settings (important for llama.cpp)

### Method 2: Built-in Plugin (Recommended)

Register in your plugin's init():

```go
package myplugin

import "github.com/orneryd/nornicdb/pkg/heimdall"

func init() {
    manager := heimdall.GetSubsystemManager()
    manager.RegisterPlugin(&MyPlugin{}, "", true) // path="", builtin=true
}
```

Then import in cmd/nornicdb/main.go:

```go
import _ "github.com/orneryd/nornicdb/plugins/myplugin"
```

---

## Testing Plugins

### Unit Testing

```go
func TestMyPlugin_Actions(t *testing.T) {
    plugin := &MyPlugin{}
    
    // Test initialization
    ctx := heimdall.SubsystemContext{
        Config:  heimdall.DefaultConfig(),
        Bifrost: &heimdall.NoOpBifrost{},
    }
    err := plugin.Initialize(ctx)
    require.NoError(t, err)
    
    // Test action
    actions := plugin.Actions()
    action, ok := actions["analyze"]
    require.True(t, ok)
    
    actCtx := heimdall.ActionContext{
        Context:     context.Background(),
        UserMessage: "analyze the graph",
        Params:      map[string]interface{}{"threshold": 0.5},
        Bifrost:     &heimdall.NoOpBifrost{},
    }
    
    result, err := action.Handler(actCtx)
    require.NoError(t, err)
    assert.True(t, result.Success)
}
```

### Integration Testing via Chat

```bash
# Start NornicDB with Heimdall enabled
NORNICDB_HEIMDALL_ENABLED=true ./nornicdb

# Open Bifrost chat UI and type:
# "run my analyze action"
# "analyze the graph with threshold 0.5"
```

---

## Example: Complete Plugin

Here's a complete anomaly detection plugin:

```go
// plugins/anomaly/plugin.go
package anomaly

import (
    "fmt"
    "sync"
    "time"

    "github.com/orneryd/nornicdb/pkg/heimdall"
)

var Plugin heimdall.HeimdallPlugin = &AnomalyPlugin{}

type AnomalyPlugin struct {
    mu       sync.RWMutex
    ctx      heimdall.SubsystemContext
    status   heimdall.SubsystemStatus
    events   []heimdall.SubsystemEvent
    lastScan time.Time
    scanCount int64
}

// === Identity ===

func (p *AnomalyPlugin) Name() string        { return "anomaly" }
func (p *AnomalyPlugin) Version() string     { return "1.0.0" }
func (p *AnomalyPlugin) Type() string        { return "heimdall" }
func (p *AnomalyPlugin) Description() string { return "Graph anomaly detection subsystem" }

// === Lifecycle ===

func (p *AnomalyPlugin) Initialize(ctx heimdall.SubsystemContext) error {
    p.mu.Lock()
    defer p.mu.Unlock()
    
    p.ctx = ctx
    p.status = heimdall.StatusReady
    p.events = make([]heimdall.SubsystemEvent, 0, 100)
    p.addEvent("info", "Anomaly detector initialized")
    return nil
}

func (p *AnomalyPlugin) Start() error {
    p.mu.Lock()
    defer p.mu.Unlock()
    p.status = heimdall.StatusRunning
    return nil
}

func (p *AnomalyPlugin) Stop() error {
    p.mu.Lock()
    defer p.mu.Unlock()
    p.status = heimdall.StatusStopped
    return nil
}

func (p *AnomalyPlugin) Shutdown() error {
    return p.Stop()
}

// === State & Health ===

func (p *AnomalyPlugin) Status() heimdall.SubsystemStatus {
    p.mu.RLock()
    defer p.mu.RUnlock()
    return p.status
}

func (p *AnomalyPlugin) Health() heimdall.SubsystemHealth {
    p.mu.RLock()
    defer p.mu.RUnlock()
    return heimdall.SubsystemHealth{
        Status:    p.status,
        Healthy:   p.status == heimdall.StatusRunning,
        LastCheck: time.Now(),
    }
}

func (p *AnomalyPlugin) Metrics() map[string]interface{} {
    p.mu.RLock()
    defer p.mu.RUnlock()
    return map[string]interface{}{
        "scan_count": p.scanCount,
        "last_scan":  p.lastScan,
    }
}

// === Configuration ===

func (p *AnomalyPlugin) Config() map[string]interface{} {
    return map[string]interface{}{"threshold": 0.8}
}

func (p *AnomalyPlugin) Configure(settings map[string]interface{}) error {
    return nil // Accept all settings
}

func (p *AnomalyPlugin) ConfigSchema() map[string]interface{} {
    return map[string]interface{}{
        "type": "object",
        "properties": map[string]interface{}{
            "threshold": map[string]interface{}{"type": "number"},
        },
    }
}

// === Actions ===

func (p *AnomalyPlugin) Actions() map[string]heimdall.ActionFunc {
    return map[string]heimdall.ActionFunc{
        "detect": {
            Description: "Detect anomalies in the graph structure",
            Category:    "analysis",
            Handler:     p.actionDetect,
        },
        "scan": {
            Description: "Full graph anomaly scan (params: depth, threshold)",
            Category:    "analysis",
            Handler:     p.actionScan,
        },
    }
}

func (p *AnomalyPlugin) actionDetect(ctx heimdall.ActionContext) (*heimdall.ActionResult, error) {
    p.mu.Lock()
    p.scanCount++
    p.lastScan = time.Now()
    p.mu.Unlock()

    // Example: Find nodes with unusually high edge counts
    results, err := ctx.Database.Query(ctx, `
        MATCH (n)
        WITH n, size((n)--()) as edgeCount
        WHERE edgeCount > 100
        RETURN n.id as id, edgeCount
        ORDER BY edgeCount DESC
        LIMIT 10
    `, nil)
    if err != nil {
        return nil, err
    }

    return &heimdall.ActionResult{
        Success: true,
        Message: fmt.Sprintf("Found %d potential anomalies (nodes with >100 edges)", len(results)),
        Data: map[string]interface{}{
            "anomalies": results,
        },
    }, nil
}

func (p *AnomalyPlugin) actionScan(ctx heimdall.ActionContext) (*heimdall.ActionResult, error) {
    // Parse params
    depth := 3
    if d, ok := ctx.Params["depth"].(float64); ok {
        depth = int(d)
    }
    
    threshold := 0.8
    if t, ok := ctx.Params["threshold"].(float64); ok {
        threshold = t
    }

    // Notify user of progress
    if ctx.Bifrost.IsConnected() {
        ctx.Bifrost.SendNotification("info", "Scan Started", 
            fmt.Sprintf("Scanning with depth=%d, threshold=%.2f", depth, threshold))
    }

    // Your anomaly detection logic here...
    
    return &heimdall.ActionResult{
        Success: true,
        Message: "Full scan complete",
        Data: map[string]interface{}{
            "depth":     depth,
            "threshold": threshold,
            "findings":  []string{},
        },
    }, nil
}

// === Data Access ===

func (p *AnomalyPlugin) Summary() string {
    return fmt.Sprintf("Anomaly detector: %d scans performed", p.scanCount)
}

func (p *AnomalyPlugin) RecentEvents(limit int) []heimdall.SubsystemEvent {
    p.mu.RLock()
    defer p.mu.RUnlock()
    if limit > len(p.events) {
        limit = len(p.events)
    }
    return p.events[len(p.events)-limit:]
}

func (p *AnomalyPlugin) addEvent(eventType, message string) {
    p.events = append(p.events, heimdall.SubsystemEvent{
        Time:    time.Now(),
        Type:    eventType,
        Message: message,
    })
}
```

---

## Best Practices

### 1. Action Naming

- Use lowercase, descriptive names: `detect`, `scan`, `configure`
- Full action name format: `heimdall.{plugin}.{action}`
- Example: `heimdall.anomaly.detect`

### 2. Parameter Extraction

```go
// Always provide defaults and type-check
threshold := 0.5 // default
if t, ok := ctx.Params["threshold"].(float64); ok {
    threshold = t
}
```

### 3. Error Handling

```go
// Return errors, don't panic
if err != nil {
    return &heimdall.ActionResult{
        Success: false,
        Message: fmt.Sprintf("Failed: %v", err),
    }, nil // Return nil error if you handled it
}
```

### 4. Progress Updates

```go
// Keep users informed for long operations
if ctx.Bifrost.IsConnected() {
    ctx.Bifrost.SendNotification("info", "Progress", "50% complete...")
}
```

### 5. Thread Safety

```go
// Protect shared state
p.mu.Lock()
p.counter++
p.mu.Unlock()
```

### 6. Action Descriptions

Write clear descriptions - they're shown to both the SLM and users:

```go
"detect": {
    Description: "Detect graph anomalies - finds nodes with unusual connectivity patterns",
    Category:    "analysis",
    Handler:     p.actionDetect,
}
```

---

## Troubleshooting

### Plugin Not Loading

1. Check plugin type returns "heimdall":
   ```go
   func (p *MyPlugin) Type() string { return "heimdall" }
   ```

2. Verify export variable exists:
   ```go
   var Plugin heimdall.HeimdallPlugin = &MyPlugin{}
   ```

3. Check build mode:
   ```bash
   go build -buildmode=plugin -o myplugin.so .
   ```

### Action Not Triggering

1. Verify action is registered:
   ```go
   // Check in Bifrost chat:
   /help
   // Should list: heimdall.myplugin.myaction
   ```

2. Check action description matches user intent - the SLM uses descriptions to map requests

3. Try explicit action name:
   ```
   User: "execute heimdall.myplugin.detect"
   ```

### Database Access Fails

1. Ensure your Cypher is read-only (SELECT only)
2. Check context isn't cancelled
3. Verify database connection in Health()

### Bifrost Communication Fails

1. Check `ctx.Bifrost.IsConnected()` before sending
2. Use `NoOpBifrost` in tests to avoid panics

---

## Reference

### Available Categories

- `monitoring` - Status, health, metrics
- `analysis` - Detection, scanning, diagnostics  
- `configuration` - Config get/set
- `optimization` - Query/storage tuning
- `curation` - Memory/data management
- `system` - Core system operations
- `test` - Test/debug actions

### Example Prompts → Actions

| User Says | Maps To |
|-----------|---------|
| "check the status" | `heimdall.watcher.status` |
| "detect anomalies" | `heimdall.anomaly.detect` |
| "say hello" | `heimdall.watcher.hello` |
| "what's the health" | `heimdall.watcher.health` |
| "show me metrics" | `heimdall.watcher.metrics` |

---

## See Also

- [Heimdall Architecture](../architecture/COGNITIVE_SLM_PROPOSAL.md)
- [Bifrost UI Guide](./BIFROST_UI_GUIDE.md)
- [Example Plugin: Watcher](../../plugins/heimdall/plugin.go)

---

**Version:** 1.0.0  
**Last Updated:** 2024-12-03  
**Maintainer:** NornicDB Team
