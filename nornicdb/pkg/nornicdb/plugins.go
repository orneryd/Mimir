// Plugin loading for NornicDB
// Automatically loads .so plugins from a configured directory at startup.
// This is independent of the apoc package - plugins are treated as opaque.
package nornicdb

import (
	"fmt"
	"os"
	"path/filepath"
	"plugin"
	"reflect"
	"sync"
)

// PluginFunction represents a function provided by a plugin.
type PluginFunction struct {
	Name        string
	Handler     interface{}
	Description string
	Category    string
}

// LoadedPlugin represents a loaded plugin.
type LoadedPlugin struct {
	Name      string
	Version   string
	Path      string
	Functions []PluginFunction
}

var (
	loadedPlugins      = make(map[string]*LoadedPlugin)
	pluginFunctions    = make(map[string]PluginFunction)
	pluginsMu          sync.RWMutex
	pluginsInitialized bool
)

// LoadPluginsFromDir scans a directory for .so files and loads them.
// Called automatically at database startup if NORNICDB_PLUGINS_DIR is set.
func LoadPluginsFromDir(dir string) error {
	if dir == "" {
		return nil
	}

	// Check if directory exists
	info, err := os.Stat(dir)
	if os.IsNotExist(err) {
		return nil // No plugins directory, that's OK
	}
	if err != nil {
		return fmt.Errorf("checking plugins directory: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("plugins path is not a directory: %s", dir)
	}

	// Find all .so files
	matches, err := filepath.Glob(filepath.Join(dir, "*.so"))
	if err != nil {
		return fmt.Errorf("scanning plugins directory: %w", err)
	}

	if len(matches) == 0 {
		return nil // No plugins found
	}

	pluginsMu.Lock()
	defer pluginsMu.Unlock()

	fmt.Println("╔══════════════════════════════════════════════════════════════╗")
	fmt.Println("║ Loading Plugins                                              ║")
	fmt.Println("╠══════════════════════════════════════════════════════════════╣")

	var totalFunctions int
	var loadedCount int

	for _, path := range matches {
		loaded, err := loadPlugin(path)
		if err != nil {
			fmt.Printf("║ ⚠ %-58s ║\n", filepath.Base(path)+": "+err.Error())
			continue
		}

		loadedPlugins[loaded.Name] = loaded
		loadedCount++
		totalFunctions += len(loaded.Functions)

		fmt.Printf("║ ✓ %-15s v%-8s  %d functions %18s ║\n",
			loaded.Name, loaded.Version, len(loaded.Functions), "")

		// Register functions
		for _, fn := range loaded.Functions {
			pluginFunctions[fn.Name] = fn
		}
	}

	fmt.Println("╠══════════════════════════════════════════════════════════════╣")
	fmt.Printf("║ Loaded: %d plugins, %d functions %28s ║\n", loadedCount, totalFunctions, "")
	fmt.Println("╚══════════════════════════════════════════════════════════════╝")

	pluginsInitialized = true
	return nil
}

// loadPlugin loads a single .so plugin file using reflection.
func loadPlugin(path string) (*LoadedPlugin, error) {
	// Open the plugin
	p, err := plugin.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open: %w", err)
	}

	// Look up the exported "Plugin" symbol
	sym, err := p.Lookup("Plugin")
	if err != nil {
		return nil, fmt.Errorf("no Plugin symbol")
	}

	// Use reflection to call methods (plugins are built separately, can't share types)
	val := reflect.ValueOf(sym)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}

	// Get Name
	nameMethod := val.MethodByName("Name")
	if !nameMethod.IsValid() {
		return nil, fmt.Errorf("no Name() method")
	}
	nameResult := nameMethod.Call(nil)
	if len(nameResult) != 1 {
		return nil, fmt.Errorf("Name() invalid return")
	}
	name := nameResult[0].String()

	// Get Version
	versionMethod := val.MethodByName("Version")
	if !versionMethod.IsValid() {
		return nil, fmt.Errorf("no Version() method")
	}
	versionResult := versionMethod.Call(nil)
	if len(versionResult) != 1 {
		return nil, fmt.Errorf("Version() invalid return")
	}
	version := versionResult[0].String()

	// Get Functions
	funcsMethod := val.MethodByName("Functions")
	if !funcsMethod.IsValid() {
		return nil, fmt.Errorf("no Functions() method")
	}
	funcsResult := funcsMethod.Call(nil)
	if len(funcsResult) != 1 {
		return nil, fmt.Errorf("Functions() invalid return")
	}

	// Parse the functions map
	var functions []PluginFunction
	mapVal := funcsResult[0]
	if mapVal.Kind() == reflect.Map {
		for _, key := range mapVal.MapKeys() {
			funcName := key.String()
			funcVal := mapVal.MapIndex(key)

			var handler interface{}
			var desc string

			if funcVal.Kind() == reflect.Struct {
				handlerField := funcVal.FieldByName("Handler")
				if handlerField.IsValid() {
					handler = handlerField.Interface()
				}
				descField := funcVal.FieldByName("Description")
				if descField.IsValid() && descField.Kind() == reflect.String {
					desc = descField.String()
				}
			}

			// If function name is already fully qualified (starts with "apoc."), use as-is
			// Otherwise, add the plugin prefix
			fullName := funcName
			if len(funcName) < 5 || funcName[:5] != "apoc." {
				fullName = fmt.Sprintf("apoc.%s.%s", name, funcName)
			}
			functions = append(functions, PluginFunction{
				Name:        fullName,
				Handler:     handler,
				Description: desc,
				Category:    name,
			})
		}
	}

	return &LoadedPlugin{
		Name:      name,
		Version:   version,
		Path:      path,
		Functions: functions,
	}, nil
}

// GetPluginFunction returns a plugin function by name.
func GetPluginFunction(name string) (PluginFunction, bool) {
	pluginsMu.RLock()
	defer pluginsMu.RUnlock()
	fn, ok := pluginFunctions[name]
	return fn, ok
}

// ListPluginFunctions returns all registered plugin function names.
func ListPluginFunctions() []string {
	pluginsMu.RLock()
	defer pluginsMu.RUnlock()
	names := make([]string, 0, len(pluginFunctions))
	for name := range pluginFunctions {
		names = append(names, name)
	}
	return names
}

// ListLoadedPlugins returns information about all loaded plugins.
func ListLoadedPlugins() []*LoadedPlugin {
	pluginsMu.RLock()
	defer pluginsMu.RUnlock()
	result := make([]*LoadedPlugin, 0, len(loadedPlugins))
	for _, p := range loadedPlugins {
		result = append(result, p)
	}
	return result
}

// PluginsInitialized returns true if plugins have been loaded.
func PluginsInitialized() bool {
	pluginsMu.RLock()
	defer pluginsMu.RUnlock()
	return pluginsInitialized
}
