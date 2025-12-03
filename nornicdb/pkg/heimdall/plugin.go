// Package heimdall provides Heimdall - the cognitive guardian for NornicDB.
//
// Heimdall is named after the all-seeing Norse god who guards Bifröst.
// Like its namesake, Heimdall watches over NornicDB's cognitive subsystems,
// providing SLM (Small Language Model) management and plugin architecture.
//
// Heimdall Plugins are a DISTINCT plugin type from regular NornicDB plugins.
// They specifically enable cognitive database features that the SLM manages.
//
// Plugin Type: HeimdallPlugin
//
// Unlike regular plugins (which provide Cypher functions), Heimdall plugins provide
// actions that the SLM can invoke based on user chat requests.
//
// How it works:
//  1. User sends chat message: "Check for graph anomalies"
//  2. SLM interprets intent and maps to registered action: "heimdall.anomaly.detect"
//  3. Action handler is invoked with context
//  4. Results returned to user via chat
//
// Plugin Loading:
//
// Heimdall plugins are loaded from NORNICDB_HEIMDALL_PLUGINS_DIR (separate from regular plugins).
// Each .so plugin must export a "Plugin" variable of type HeimdallPlugin.
//
// Built-in Heimdall Plugins:
//
// Core Heimdall plugins ship with NornicDB:
//   - watcher: SLM management (heimdall.watcher.*) - the core guardian
//   - anomaly: Graph anomaly detection (heimdall.anomaly.*)
//   - health: Runtime health diagnosis (heimdall.health.*)
//   - curator: Memory curation (heimdall.curator.*)
//   - optimizer: Query optimization (heimdall.optimizer.*)
//
// Custom Heimdall Plugins:
//
// Example implementing HeimdallPlugin interface:
//
//	package main
//
//	import "github.com/orneryd/nornicdb/pkg/heimdall"
//
//	// MySubsystem implements heimdall.HeimdallPlugin
//	type MySubsystem struct{}
//
//	func (p *MySubsystem) Name() string    { return "mysubsystem" }
//	func (p *MySubsystem) Version() string { return "1.0.0" }
//	func (p *MySubsystem) Type() string    { return "heimdall" } // MUST return "heimdall"
//
//	func (p *MySubsystem) Actions() map[string]heimdall.ActionFunc {
//	    return map[string]heimdall.ActionFunc{
//	        "analyze": {
//	            Handler:     p.Analyze,
//	            Description: "Analyze custom metrics",
//	            Category:    "analysis",
//	        },
//	    }
//	}
//
//	func (p *MySubsystem) Analyze(ctx heimdall.ActionContext) (*heimdall.ActionResult, error) {
//	    // Your implementation
//	    return &heimdall.ActionResult{Success: true, Message: "Done"}, nil
//	}
//
//	// Export as HeimdallPlugin type
//	var Plugin heimdall.HeimdallPlugin = &MySubsystem{}
package heimdall

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"plugin"
	"reflect"
	"sync"
	"time"
)

// PluginType identifies the type of plugin.
const PluginTypeHeimdall = "heimdall"

// HeimdallPlugin is the interface that all Heimdall plugins must implement.
// This is a DISTINCT plugin type from regular NornicDB plugins.
//
// Regular plugins provide Cypher functions (apoc.*).
// Heimdall plugins provide SUBSYSTEM MANAGEMENT for cognitive database features.
//
// Heimdall (the guardian) uses this interface to:
//   - Query subsystem state and health
//   - Configure subsystem behavior
//   - Control subsystem lifecycle
//   - Execute subsystem actions
//   - Collect subsystem metrics
type HeimdallPlugin interface {
	// === Identity ===

	// Name returns the plugin/subsystem identifier (e.g., "anomaly", "health", "curator")
	Name() string

	// Version returns the plugin version (semver format)
	Version() string

	// Type must return "heimdall" to identify this as a Heimdall plugin
	Type() string

	// Description returns human-readable description of what this subsystem does
	Description() string

	// === Lifecycle Management ===

	// Initialize is called when the subsystem is loaded
	// Receives context for accessing database, config, etc.
	Initialize(ctx SubsystemContext) error

	// Start begins the subsystem's background operations (if any)
	Start() error

	// Stop halts the subsystem's background operations
	Stop() error

	// Shutdown is called when the subsystem is being unloaded
	Shutdown() error

	// === State & Health ===

	// Status returns current subsystem status
	Status() SubsystemStatus

	// Health returns detailed health information
	Health() SubsystemHealth

	// Metrics returns subsystem-specific metrics for the SLM to analyze
	Metrics() map[string]interface{}

	// === Configuration ===

	// Config returns current configuration
	Config() map[string]interface{}

	// Configure updates subsystem configuration
	// The SLM can use this to tune subsystem behavior
	Configure(settings map[string]interface{}) error

	// Schema returns the configuration schema (for validation)
	ConfigSchema() map[string]interface{}

	// === Actions ===

	// Actions returns all actions this subsystem provides
	// Map key is the action name (e.g., "detect"), will be prefixed as slm.{name}.{action}
	Actions() map[string]ActionFunc

	// === Data Access (for SLM reasoning) ===

	// Summary returns a text summary of current subsystem state
	// Used by SLM to understand what the subsystem is doing
	Summary() string

	// RecentEvents returns recent notable events from this subsystem
	// Used by SLM for contextual awareness
	RecentEvents(limit int) []SubsystemEvent
}

// SubsystemContext is provided to plugins during initialization.
type SubsystemContext struct {
	// Config is the Heimdall configuration
	Config Config

	// Database provides read-only database access
	Database DatabaseReader

	// Metrics provides runtime metrics
	Metrics MetricsReader

	// Logger for subsystem logging
	Logger SubsystemLogger

	// Bifrost provides the communication bridge to connected clients
	// Plugins can use this to send messages, notifications, and request input
	Bifrost BifrostBridge
}

// BifrostBridge is the interface for plugins to communicate via Bifrost.
// Named after the rainbow bridge connecting Asgard to other realms.
type BifrostBridge interface {
	// SendMessage sends a message to connected Bifrost clients.
	// The message appears as a system message in the chat.
	SendMessage(msg string) error

	// SendNotification sends a notification with a specific type.
	// Types: "info", "warning", "error", "success"
	SendNotification(notifType, title, message string) error

	// Broadcast sends a message to all connected clients.
	// Useful for system-wide announcements.
	Broadcast(msg string) error

	// RequestConfirmation asks the user to confirm an action.
	// Returns true if user confirms, false if they decline or timeout.
	// The action parameter describes what needs confirmation.
	RequestConfirmation(action string) (bool, error)

	// IsConnected returns true if there are active Bifrost connections.
	IsConnected() bool

	// ConnectionCount returns the number of active Bifrost connections.
	ConnectionCount() int
}

// NoOpBifrost is a no-op implementation for when Bifrost is not available.
type NoOpBifrost struct{}

func (n *NoOpBifrost) SendMessage(msg string) error                    { return nil }
func (n *NoOpBifrost) SendNotification(t, title, msg string) error     { return nil }
func (n *NoOpBifrost) Broadcast(msg string) error                      { return nil }
func (n *NoOpBifrost) RequestConfirmation(action string) (bool, error) { return false, nil }
func (n *NoOpBifrost) IsConnected() bool                               { return false }
func (n *NoOpBifrost) ConnectionCount() int                            { return 0 }

// SubsystemLogger is the logging interface for subsystems.
type SubsystemLogger interface {
	Debug(msg string, args ...interface{})
	Info(msg string, args ...interface{})
	Warn(msg string, args ...interface{})
	Error(msg string, args ...interface{})
}

// SubsystemStatus represents the current state of a subsystem.
type SubsystemStatus string

const (
	StatusUninitialized SubsystemStatus = "uninitialized"
	StatusInitializing  SubsystemStatus = "initializing"
	StatusReady         SubsystemStatus = "ready"
	StatusRunning       SubsystemStatus = "running"
	StatusStopping      SubsystemStatus = "stopping"
	StatusStopped       SubsystemStatus = "stopped"
	StatusError         SubsystemStatus = "error"
)

// SubsystemHealth contains detailed health information.
type SubsystemHealth struct {
	Status    SubsystemStatus        `json:"status"`
	Healthy   bool                   `json:"healthy"`
	Message   string                 `json:"message,omitempty"`
	LastCheck time.Time              `json:"last_check"`
	Details   map[string]interface{} `json:"details,omitempty"`
}

// SubsystemEvent represents a notable event from a subsystem.
type SubsystemEvent struct {
	Time    time.Time              `json:"time"`
	Type    string                 `json:"type"` // "info", "warning", "error", "action"
	Message string                 `json:"message"`
	Data    map[string]interface{} `json:"data,omitempty"`
}

// ActionFunc represents an action function provided by an SLM plugin.
// This mirrors PluginFunction from pkg/nornicdb/plugins.go
type ActionFunc struct {
	Name        string                                         // Full name: slm.{plugin}.{action}
	Handler     func(ctx ActionContext) (*ActionResult, error) // The action handler
	Description string                                         // Human-readable description
	Category    string                                         // Grouping: monitoring, optimization, curation
}

// ActionContext provides context for action execution.
// Passed to handlers when actions are invoked.
type ActionContext struct {
	context.Context

	// UserMessage is what the user said to trigger this action
	UserMessage string

	// Params extracted from user message by SLM
	Params map[string]interface{}

	// Database provides read-only graph access
	Database DatabaseReader

	// Metrics provides runtime metrics
	Metrics MetricsReader

	// Bifrost provides communication bridge to the user
	// Use this to send progress updates, request confirmation, etc.
	Bifrost BifrostBridge
}

// ActionResult is the outcome of action execution.
type ActionResult struct {
	Success bool                   `json:"success"`
	Message string                 `json:"message"`
	Data    map[string]interface{} `json:"data,omitempty"`
}

// DatabaseReader provides read-only database access for actions.
type DatabaseReader interface {
	// Query executes a read-only Cypher query
	Query(ctx context.Context, cypher string, params map[string]interface{}) ([]map[string]interface{}, error)
	// Stats returns database statistics
	Stats() DatabaseStats
}

// DatabaseStats contains database statistics.
type DatabaseStats struct {
	NodeCount         int64            `json:"node_count"`
	RelationshipCount int64            `json:"relationship_count"`
	LabelCounts       map[string]int64 `json:"label_counts"`
}

// MetricsReader provides runtime metrics access for actions.
type MetricsReader interface {
	// Runtime returns current runtime metrics
	Runtime() RuntimeMetrics
}

// RuntimeMetrics contains runtime statistics.
type RuntimeMetrics struct {
	GoroutineCount int    `json:"goroutine_count"`
	MemoryAllocMB  uint64 `json:"memory_alloc_mb"`
	NumGC          uint32 `json:"num_gc"`
}

// LoadedHeimdallPlugin represents a loaded SLM plugin with full subsystem management.
type LoadedHeimdallPlugin struct {
	Plugin  HeimdallPlugin // The actual plugin implementing full interface
	Path    string         // Path to .so file (empty for built-in)
	Builtin bool           // True if this is a built-in plugin
}

// SubsystemManager manages all SLM plugins/subsystems.
// Provides the SLM with full control over registered subsystems.
type SubsystemManager struct {
	mu          sync.RWMutex
	plugins     map[string]*LoadedHeimdallPlugin // keyed by plugin name
	actions     map[string]ActionFunc            // keyed by full name: slm.plugin.action
	ctx         SubsystemContext                 // shared context for subsystems
	initialized bool
}

var (
	globalManager   *SubsystemManager
	globalManagerMu sync.Mutex
)

// GetSubsystemManager returns the global subsystem manager (creates if needed).
func GetSubsystemManager() *SubsystemManager {
	globalManagerMu.Lock()
	defer globalManagerMu.Unlock()
	if globalManager == nil {
		globalManager = &SubsystemManager{
			plugins: make(map[string]*LoadedHeimdallPlugin),
			actions: make(map[string]ActionFunc),
		}
	}
	return globalManager
}

// SetContext configures the shared context for all subsystems.
func (m *SubsystemManager) SetContext(ctx SubsystemContext) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ctx = ctx
}

// RegisterPlugin registers an SLM plugin and initializes it.
func (m *SubsystemManager) RegisterPlugin(p HeimdallPlugin, path string, builtin bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	name := p.Name()

	// Verify it's an SLM plugin type
	if p.Type() != PluginTypeHeimdall {
		return fmt.Errorf("plugin %s has type %q, expected %q", name, p.Type(), PluginTypeHeimdall)
	}

	if _, exists := m.plugins[name]; exists {
		return fmt.Errorf("plugin already registered: %s", name)
	}

	// Initialize the subsystem
	if err := p.Initialize(m.ctx); err != nil {
		return fmt.Errorf("failed to initialize %s: %w", name, err)
	}

	// Register plugin
	m.plugins[name] = &LoadedHeimdallPlugin{
		Plugin:  p,
		Path:    path,
		Builtin: builtin,
	}

	// Register all actions from this plugin
	for actionName, action := range p.Actions() {
		fullName := fmt.Sprintf("heimdall.%s.%s", name, actionName)
		action.Name = fullName
		m.actions[fullName] = action
	}

	// Mark as initialized once we have at least one plugin
	m.initialized = true

	return nil
}

// GetPlugin returns a plugin by name.
func (m *SubsystemManager) GetPlugin(name string) (HeimdallPlugin, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if lp, ok := m.plugins[name]; ok {
		return lp.Plugin, true
	}
	return nil, false
}

// GetAction returns an action by full name (e.g., "heimdall.plugin.action").
func (m *SubsystemManager) GetAction(name string) (ActionFunc, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	action, ok := m.actions[name]
	return action, ok
}

// StartAll starts all registered subsystems.
func (m *SubsystemManager) StartAll() error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for name, lp := range m.plugins {
		if err := lp.Plugin.Start(); err != nil {
			return fmt.Errorf("failed to start %s: %w", name, err)
		}
	}
	return nil
}

// StopAll stops all registered subsystems.
func (m *SubsystemManager) StopAll() error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var lastErr error
	for name, lp := range m.plugins {
		if err := lp.Plugin.Stop(); err != nil {
			lastErr = fmt.Errorf("failed to stop %s: %w", name, err)
		}
	}
	return lastErr
}

// ShutdownAll shuts down all registered subsystems.
func (m *SubsystemManager) ShutdownAll() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	var lastErr error
	for name, lp := range m.plugins {
		if err := lp.Plugin.Shutdown(); err != nil {
			lastErr = fmt.Errorf("failed to shutdown %s: %w", name, err)
		}
	}
	m.plugins = make(map[string]*LoadedHeimdallPlugin)
	m.actions = make(map[string]ActionFunc)
	return lastErr
}

// AllHealth returns health status of all subsystems.
func (m *SubsystemManager) AllHealth() map[string]SubsystemHealth {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make(map[string]SubsystemHealth)
	for name, lp := range m.plugins {
		result[name] = lp.Plugin.Health()
	}
	return result
}

// AllSummaries returns summaries of all subsystems (for SLM context).
func (m *SubsystemManager) AllSummaries() map[string]string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make(map[string]string)
	for name, lp := range m.plugins {
		result[name] = lp.Plugin.Summary()
	}
	return result
}

// LoadHeimdallPluginsFromDir scans a directory for .so files and loads them.
// Called at startup if NORNICDB_HEIMDALL_PLUGINS_DIR is set.
func LoadHeimdallPluginsFromDir(dir string, ctx SubsystemContext) error {
	if dir == "" {
		return nil
	}

	info, err := os.Stat(dir)
	if os.IsNotExist(err) {
		return nil // No plugins directory
	}
	if err != nil {
		return fmt.Errorf("checking Heimdall plugins directory: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("Heimdall plugins path is not a directory: %s", dir)
	}

	matches, err := filepath.Glob(filepath.Join(dir, "*.so"))
	if err != nil {
		return fmt.Errorf("scanning Heimdall plugins directory: %w", err)
	}

	if len(matches) == 0 {
		return nil
	}

	manager := GetSubsystemManager()
	manager.SetContext(ctx)

	fmt.Println("╔══════════════════════════════════════════════════════════════╗")
	fmt.Println("║ Loading SLM Plugins                                          ║")
	fmt.Println("╠══════════════════════════════════════════════════════════════╣")

	var totalActions int
	var loadedCount int

	for _, path := range matches {
		p, err := loadHeimdallPluginFromFile(path)
		if err != nil {
			fmt.Printf("║ ⚠ %-58s ║\n", filepath.Base(path)+": "+err.Error())
			continue
		}

		if err := manager.RegisterPlugin(p, path, false); err != nil {
			fmt.Printf("║ ⚠ %-58s ║\n", p.Name()+": "+err.Error())
			continue
		}

		loadedCount++
		totalActions += len(p.Actions())

		fmt.Printf("║ ✓ %-15s v%-8s  %d actions %18s ║\n",
			p.Name(), p.Version(), len(p.Actions()), "")
	}

	fmt.Println("╠══════════════════════════════════════════════════════════════╣")
	fmt.Printf("║ Loaded: %d plugins, %d actions %28s ║\n", loadedCount, totalActions, "")
	fmt.Println("╚══════════════════════════════════════════════════════════════╝")

	manager.mu.Lock()
	manager.initialized = true
	manager.mu.Unlock()

	return nil
}

// loadHeimdallPluginFromFile loads a single .so plugin file.
// The plugin must implement the HeimdallPlugin interface.
func loadHeimdallPluginFromFile(path string) (HeimdallPlugin, error) {
	p, err := plugin.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open: %w", err)
	}

	sym, err := p.Lookup("Plugin")
	if err != nil {
		return nil, fmt.Errorf("no Plugin symbol")
	}

	// Try direct cast to HeimdallPlugin
	if slmPlugin, ok := sym.(HeimdallPlugin); ok {
		// Verify it's the right type
		if slmPlugin.Type() != PluginTypeHeimdall {
			return nil, fmt.Errorf("plugin type is %q, expected %q", slmPlugin.Type(), PluginTypeHeimdall)
		}
		return slmPlugin, nil
	}

	// Try pointer to HeimdallPlugin
	if slmPluginPtr, ok := sym.(*HeimdallPlugin); ok && slmPluginPtr != nil {
		if (*slmPluginPtr).Type() != PluginTypeHeimdall {
			return nil, fmt.Errorf("plugin type is %q, expected %q", (*slmPluginPtr).Type(), PluginTypeHeimdall)
		}
		return *slmPluginPtr, nil
	}

	// Use reflection as fallback (for plugins built separately)
	val := reflect.ValueOf(sym)
	if val.Kind() == reflect.Ptr && !val.IsNil() {
		val = val.Elem()
	}

	// Check for required methods
	requiredMethods := []string{"Name", "Version", "Type", "Description", "Initialize", "Start", "Stop", "Shutdown", "Status", "Health", "Metrics", "Config", "Configure", "ConfigSchema", "Actions", "Summary", "RecentEvents"}
	for _, method := range requiredMethods {
		if !val.MethodByName(method).IsValid() {
			return nil, fmt.Errorf("missing %s() method - plugin must implement HeimdallPlugin interface", method)
		}
	}

	// Wrap in reflectHeimdallPlugin adapter
	return &reflectHeimdallPlugin{val: val}, nil
}

// reflectHeimdallPlugin wraps a plugin loaded via reflection.
type reflectHeimdallPlugin struct {
	val reflect.Value
}

func (p *reflectHeimdallPlugin) Name() string {
	return p.val.MethodByName("Name").Call(nil)[0].String()
}
func (p *reflectHeimdallPlugin) Version() string {
	return p.val.MethodByName("Version").Call(nil)[0].String()
}
func (p *reflectHeimdallPlugin) Type() string {
	return p.val.MethodByName("Type").Call(nil)[0].String()
}
func (p *reflectHeimdallPlugin) Description() string {
	return p.val.MethodByName("Description").Call(nil)[0].String()
}
func (p *reflectHeimdallPlugin) Initialize(ctx SubsystemContext) error {
	result := p.val.MethodByName("Initialize").Call([]reflect.Value{reflect.ValueOf(ctx)})
	if len(result) > 0 && !result[0].IsNil() {
		return result[0].Interface().(error)
	}
	return nil
}
func (p *reflectHeimdallPlugin) Start() error {
	result := p.val.MethodByName("Start").Call(nil)
	if len(result) > 0 && !result[0].IsNil() {
		return result[0].Interface().(error)
	}
	return nil
}
func (p *reflectHeimdallPlugin) Stop() error {
	result := p.val.MethodByName("Stop").Call(nil)
	if len(result) > 0 && !result[0].IsNil() {
		return result[0].Interface().(error)
	}
	return nil
}
func (p *reflectHeimdallPlugin) Shutdown() error {
	result := p.val.MethodByName("Shutdown").Call(nil)
	if len(result) > 0 && !result[0].IsNil() {
		return result[0].Interface().(error)
	}
	return nil
}
func (p *reflectHeimdallPlugin) Status() SubsystemStatus {
	result := p.val.MethodByName("Status").Call(nil)
	if s, ok := result[0].Interface().(SubsystemStatus); ok {
		return s
	}
	return StatusError
}
func (p *reflectHeimdallPlugin) Health() SubsystemHealth {
	result := p.val.MethodByName("Health").Call(nil)
	if h, ok := result[0].Interface().(SubsystemHealth); ok {
		return h
	}
	return SubsystemHealth{Status: StatusError, Healthy: false}
}
func (p *reflectHeimdallPlugin) Metrics() map[string]interface{} {
	result := p.val.MethodByName("Metrics").Call(nil)
	if m, ok := result[0].Interface().(map[string]interface{}); ok {
		return m
	}
	return nil
}
func (p *reflectHeimdallPlugin) Config() map[string]interface{} {
	result := p.val.MethodByName("Config").Call(nil)
	if m, ok := result[0].Interface().(map[string]interface{}); ok {
		return m
	}
	return nil
}
func (p *reflectHeimdallPlugin) Configure(settings map[string]interface{}) error {
	result := p.val.MethodByName("Configure").Call([]reflect.Value{reflect.ValueOf(settings)})
	if len(result) > 0 && !result[0].IsNil() {
		return result[0].Interface().(error)
	}
	return nil
}
func (p *reflectHeimdallPlugin) ConfigSchema() map[string]interface{} {
	result := p.val.MethodByName("ConfigSchema").Call(nil)
	if m, ok := result[0].Interface().(map[string]interface{}); ok {
		return m
	}
	return nil
}
func (p *reflectHeimdallPlugin) Actions() map[string]ActionFunc {
	result := p.val.MethodByName("Actions").Call(nil)
	if m, ok := result[0].Interface().(map[string]ActionFunc); ok {
		return m
	}
	return nil
}
func (p *reflectHeimdallPlugin) Summary() string {
	return p.val.MethodByName("Summary").Call(nil)[0].String()
}
func (p *reflectHeimdallPlugin) RecentEvents(limit int) []SubsystemEvent {
	result := p.val.MethodByName("RecentEvents").Call([]reflect.Value{reflect.ValueOf(limit)})
	if e, ok := result[0].Interface().([]SubsystemEvent); ok {
		return e
	}
	return nil
}

// GetHeimdallAction returns an action by full name (e.g., "heimdall.anomaly.detect").
func GetHeimdallAction(name string) (ActionFunc, bool) {
	m := GetSubsystemManager()
	m.mu.RLock()
	defer m.mu.RUnlock()
	action, ok := m.actions[name]
	return action, ok
}

// ListHeimdallActions returns all registered SLM action names.
func ListHeimdallActions() []string {
	m := GetSubsystemManager()
	m.mu.RLock()
	defer m.mu.RUnlock()
	names := make([]string, 0, len(m.actions))
	for name := range m.actions {
		names = append(names, name)
	}
	return names
}

// ListHeimdallPlugins returns information about all loaded SLM plugins.
func ListHeimdallPlugins() []*LoadedHeimdallPlugin {
	m := GetSubsystemManager()
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make([]*LoadedHeimdallPlugin, 0, len(m.plugins))
	for _, p := range m.plugins {
		result = append(result, p)
	}
	return result
}

// RegisterBuiltinAction registers a built-in action (not from .so plugin).
// Used to register core actions without requiring external plugins.
func RegisterBuiltinAction(action ActionFunc) {
	m := GetSubsystemManager()
	m.mu.Lock()
	defer m.mu.Unlock()
	m.actions[action.Name] = action
}

// ExecuteAction executes an action by name with the given context.
func ExecuteAction(name string, ctx ActionContext) (*ActionResult, error) {
	m := GetSubsystemManager()
	m.mu.RLock()
	action, ok := m.actions[name]
	m.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("unknown action: %s", name)
	}

	if action.Handler == nil {
		return nil, fmt.Errorf("action %s has no handler", name)
	}

	return action.Handler(ctx)
}

// ActionCatalog returns all actions grouped by category for display.
func ActionCatalog() map[string][]ActionFunc {
	m := GetSubsystemManager()
	m.mu.RLock()
	defer m.mu.RUnlock()

	catalog := make(map[string][]ActionFunc)
	for _, action := range m.actions {
		cat := action.Category
		if cat == "" {
			cat = "general"
		}
		catalog[cat] = append(catalog[cat], action)
	}
	return catalog
}

// HeimdallPluginsInitialized returns true if SLM plugins have been loaded.
func HeimdallPluginsInitialized() bool {
	m := GetSubsystemManager()
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.initialized
}

// BuiltinActions returns the default built-in actions.
// These are registered automatically when the SLM package initializes.
func BuiltinActions() []ActionFunc {
	return []ActionFunc{
		{
			Name:        "heimdall.help",
			Description: "List all available SLM actions",
			Category:    "system",
			Handler: func(ctx ActionContext) (*ActionResult, error) {
				catalog := ActionCatalog()
				return &ActionResult{
					Success: true,
					Message: "Available actions by category",
					Data:    map[string]interface{}{"catalog": catalog},
				}, nil
			},
		},
		{
			Name:        "heimdall.status",
			Description: "Get SLM system status",
			Category:    "system",
			Handler: func(ctx ActionContext) (*ActionResult, error) {
				plugins := ListHeimdallPlugins()
				actions := ListHeimdallActions()
				return &ActionResult{
					Success: true,
					Message: fmt.Sprintf("%d plugins, %d actions loaded", len(plugins), len(actions)),
					Data: map[string]interface{}{
						"plugins": len(plugins),
						"actions": len(actions),
					},
				}, nil
			},
		},
	}
}

// InitBuiltinActions registers all built-in actions.
// Called during package initialization.
func InitBuiltinActions() {
	for _, action := range BuiltinActions() {
		RegisterBuiltinAction(action)
	}
}

func init() {
	// Don't auto-init - let the Manager control this
	// InitBuiltinActions() is called explicitly when SLM is enabled
}

// ActionPrompt generates a list of available actions.
func ActionPrompt() string {
	catalog := ActionCatalog()

	var prompt string
	for category, actions := range catalog {
		prompt += fmt.Sprintf("## %s\n", category)
		for _, action := range actions {
			prompt += fmt.Sprintf("- %s: %s\n", action.Name, action.Description)
		}
		prompt += "\n"
	}

	return prompt
}

// ParseActionResponse parses an SLM response to extract action requests.
type ParsedAction struct {
	Action string                 `json:"action"`
	Params map[string]interface{} `json:"params"`
}

// ActionInvoker handles action invocation from SLM responses.
type ActionInvoker struct {
	db      DatabaseReader
	metrics MetricsReader
}

// NewActionInvoker creates an action invoker with database/metrics access.
func NewActionInvoker(db DatabaseReader, metrics MetricsReader) *ActionInvoker {
	return &ActionInvoker{db: db, metrics: metrics}
}

// Invoke executes a parsed action.
func (i *ActionInvoker) Invoke(ctx context.Context, parsed ParsedAction, userMessage string) (*ActionResult, error) {
	actCtx := ActionContext{
		Context:     ctx,
		UserMessage: userMessage,
		Params:      parsed.Params,
		Database:    i.db,
		Metrics:     i.metrics,
	}

	start := time.Now()
	result, err := ExecuteAction(parsed.Action, actCtx)
	if result != nil && result.Data == nil {
		result.Data = make(map[string]interface{})
	}
	if result != nil {
		result.Data["duration_ms"] = time.Since(start).Milliseconds()
	}
	return result, err
}
