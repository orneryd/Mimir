# NornicDB Plugin Architecture

**Status:** Design  
**Version:** 0.1  
**Date:** December 1, 2025

## Overview

NornicDB supports extensible Cypher functions through a plugin system. This allows:

- **Community extensions** without forking
- **Selective loading** of only needed functions
- **Custom functions** for specific use cases
- **Clean separation** of core vs extended functionality

## Why Plugins vs Built-in?

| Approach | Pros | Cons |
|----------|------|------|
| **All Built-in** | Simple deployment | Bloat, maintenance burden, slow startup |
| **Plugin System** | Modular, community-driven, lean core | Slightly more complex setup |

**Decision:** Plugin system - keeps core fast and focused while enabling extensibility.

## Plugin Types

### 1. Cypher Function Plugins

Add custom functions callable in Cypher queries:

```go
// Example: Text analysis plugin
type Plugin interface {
    Name() string
    Version() string
    Functions() []FunctionDef
}

type TextAnalysisPlugin struct{}

func (p *TextAnalysisPlugin) Functions() []FunctionDef {
    return []FunctionDef{
        {
            Name:        "text.sentiment",
            Description: "Analyze sentiment of text",
            Args:        []ArgDef{{Name: "text", Type: "STRING"}},
            Returns:     "FLOAT",
            Handler:     p.sentiment,
        },
        {
            Name:        "text.summarize",
            Description: "Summarize text content",
            Args:        []ArgDef{{Name: "text", Type: "STRING"}, {Name: "maxLength", Type: "INTEGER"}},
            Returns:     "STRING",
            Handler:     p.summarize,
        },
    }
}
```

**Usage in Cypher:**
```cypher
MATCH (n:Document)
RETURN n.title, text.sentiment(n.content) AS sentiment
ORDER BY sentiment DESC
```

### 2. Procedure Plugins

Add custom CALL procedures:

```go
type ProcedurePlugin interface {
    Plugin
    Procedures() []ProcedureDef
}

type GraphAlgoPlugin struct{}

func (p *GraphAlgoPlugin) Procedures() []ProcedureDef {
    return []ProcedureDef{
        {
            Name:        "algo.pageRank",
            Description: "Calculate PageRank for nodes",
            Args:        []ArgDef{{Name: "iterations", Type: "INTEGER"}},
            Yields:      []YieldDef{{Name: "nodeId", Type: "STRING"}, {Name: "score", Type: "FLOAT"}},
            Handler:     p.pageRank,
        },
    }
}
```

**Usage:**
```cypher
CALL algo.pageRank(20) YIELD nodeId, score
RETURN nodeId, score ORDER BY score DESC LIMIT 10
```

### 3. Aggregation Function Plugins

Custom aggregate functions:

```go
type AggregationPlugin interface {
    Plugin
    Aggregations() []AggregationDef
}

// Example: percentile, median, mode
```

## Plugin Loading

### Configuration

```yaml
# nornicdb.yaml
plugins:
  enabled: true
  directory: /etc/nornicdb/plugins
  autoload:
    - text-analysis
    - graph-algorithms
```

### Environment Variables

```bash
NORNICDB_PLUGINS_ENABLED=true
NORNICDB_PLUGINS_DIR=/etc/nornicdb/plugins
NORNICDB_PLUGINS_LOAD=text-analysis,graph-algorithms
```

### Runtime Loading

```cypher
-- List available plugins
CALL dbms.plugins.list() YIELD name, version, functions, procedures

-- Load a plugin
CALL dbms.plugins.load('text-analysis')

-- Unload a plugin
CALL dbms.plugins.unload('text-analysis')
```

## Plugin Interface (Go)

```go
package plugin

// Plugin is the base interface all plugins must implement
type Plugin interface {
    // Name returns the plugin identifier (e.g., "text-analysis")
    Name() string
    
    // Version returns semantic version (e.g., "1.0.0")
    Version() string
    
    // Description returns human-readable description
    Description() string
    
    // Initialize is called when the plugin is loaded
    Initialize(ctx PluginContext) error
    
    // Shutdown is called when the plugin is unloaded
    Shutdown() error
}

// FunctionPlugin provides custom Cypher functions
type FunctionPlugin interface {
    Plugin
    Functions() []FunctionDefinition
}

// ProcedurePlugin provides custom CALL procedures  
type ProcedurePlugin interface {
    Plugin
    Procedures() []ProcedureDefinition
}

// PluginContext provides access to NornicDB internals
type PluginContext interface {
    // Storage access (read-only by default)
    Storage() StorageReader
    
    // Logger for plugin output
    Logger() *log.Logger
    
    // Config access
    Config(key string) interface{}
}
```

## Planned Core Plugins

### 1. `apoc-core` - Essential APOC Functions

Most-used APOC functions:

```
apoc.coll.sum, apoc.coll.avg, apoc.coll.min, apoc.coll.max
apoc.text.join, apoc.text.split, apoc.text.replace
apoc.date.format, apoc.date.parse
apoc.convert.toJson, apoc.convert.fromJson
apoc.map.merge, apoc.map.fromPairs
```

### 2. `graph-algorithms` - Graph Analytics

```
algo.pageRank
algo.betweenness
algo.closeness
algo.communityDetection
algo.shortestPath.dijkstra
algo.allShortestPaths
```

### 3. `text-analysis` - NLP Functions

```
text.sentiment
text.keywords
text.summarize
text.similarity
text.language
```

### 4. `temporal` - Advanced Date/Time

```
temporal.between
temporal.duration.between
temporal.truncate
temporal.add
```

## Security Considerations

1. **Sandboxing**: Plugins run in restricted context
2. **Permissions**: Admin-only plugin management
3. **Audit**: Plugin load/unload events logged
4. **Signatures**: Optional plugin signature verification

## Implementation Phases

### Phase 1: Foundation (v0.2.0)
- [ ] Plugin interface definition
- [ ] Plugin loader/unloader
- [ ] Basic function registration
- [ ] `dbms.plugins.*` procedures

### Phase 2: Core Plugins (v0.3.0)
- [ ] `apoc-core` plugin with 20 most-used functions
- [ ] `graph-algorithms` plugin
- [ ] Plugin distribution mechanism

### Phase 3: Community (v0.4.0)
- [ ] Plugin registry/marketplace
- [ ] Plugin development SDK
- [ ] Documentation and examples

## Example: Creating a Plugin

```go
// myplugin/plugin.go
package main

import "github.com/orneryd/nornicdb/pkg/plugin"

type MyPlugin struct{}

func (p *MyPlugin) Name() string        { return "my-plugin" }
func (p *MyPlugin) Version() string     { return "1.0.0" }
func (p *MyPlugin) Description() string { return "My custom functions" }

func (p *MyPlugin) Initialize(ctx plugin.PluginContext) error {
    ctx.Logger().Println("MyPlugin initialized")
    return nil
}

func (p *MyPlugin) Shutdown() error { return nil }

func (p *MyPlugin) Functions() []plugin.FunctionDefinition {
    return []plugin.FunctionDefinition{
        {
            Name:    "my.hello",
            Args:    []plugin.Arg{{Name: "name", Type: "STRING"}},
            Returns: "STRING",
            Handler: func(args []interface{}) (interface{}, error) {
                name := args[0].(string)
                return "Hello, " + name + "!", nil
            },
        },
    }
}

// Plugin export
var NornicDBPlugin plugin.Plugin = &MyPlugin{}
```

**Build:**
```bash
go build -buildmode=plugin -o myplugin.so myplugin/plugin.go
```

**Load:**
```bash
cp myplugin.so /etc/nornicdb/plugins/
```

**Use:**
```cypher
RETURN my.hello('World') AS greeting
// Returns: "Hello, World!"
```

## Related Documentation

- [Functions Index](FUNCTIONS_INDEX.md) - Built-in functions
- [APOC Compatibility](APOC_COMPATIBILITY.md) - APOC function status
- [Contributing](CONTRIBUTING.md) - How to contribute plugins

---

_This is a design document. Implementation is planned for v0.2.0._
