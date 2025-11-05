# Knowledge Graph Enhancement for TODO Manager MCP

## 🎉 What's New

I've created an enhanced version of your TODO Manager MCP server that includes **knowledge graph capabilities**! This allows you to create rich, interconnected data structures alongside your TODOs.

## 🏗️ Architecture

### Original (v1.0): TODOs Only
```
TODOs → Simple list with parent-child relationships
```

### Enhanced (v2.0): TODOs + Knowledge Graph
```
TODOs → Stored in both TODO manager AND knowledge graph
Knowledge Graph → Nodes (entities) + Edges (relationships)
  → Rich querying and traversal capabilities
```

## 📊 What You Can Now Do

### 1. Create Rich Entity Networks

**Nodes (Entities):**
- `todo` - Your TODO items
- `person` - Team members, stakeholders
- `file` - Source files, documents
- `concept` - Ideas, requirements, features
- `project` - Projects, epics
- `custom` - Anything else

**Edges (Relationships):**
- `depends_on` - Dependencies between tasks
- `related_to` - General relationships
- `assigned_to` - Assignment relationships
- `contains` - Hierarchical containment
- `references` - References/mentions
- `custom` - Custom relationship types

### 2. Example Use Cases

####  Project Management
```typescript
// Create project node
memory_add_node({ type: "project", properties: { title: "User Authentication System" } })

// Create person nodes
memory_add_node({ type: "person", properties: { title: "John Doe", role: "developer" } })

// Create TODO and link to project
create_todo({ title: "Implement JWT", addToGraph: true })
memory_add_edge({ source: "todo-1-...", target: "project-node-id", type: "contains" })

// Assign to person
memory_add_edge({ source: "john-doe-id", target: "todo-1-...", type: "assigned_to" })
```

#### File Tracking
```typescript
// Track which files are related to which TODOs
memory_add_node({ type: "file", properties: { title: "auth.ts", path: "src/auth/auth.ts" })
memory_add_edge({ source: "todo-1-...", target: "file-node-id", type: "references" })

// Find all TODOs related to a file
memory_get_neighbors({ nodeId: "file-node-id", direction: "in", edgeType: "references" })
```

#### Dependency Tracking
```typescript
// Create dependency chain
memory_add_edge({ source: "todo-2-...", target: "todo-1-...", type: "depends_on" })

// Find what must be done before a task
memory_get_neighbors({ nodeId: "todo-2-...", direction: "out", edgeType: "depends_on" })
```

####  Concept Mapping
```typescript
// Track concepts/requirements
memory_add_node({ type: "concept", properties: { title: "OAuth 2.0 Flow" } }
memory_add_node({ type: "concept", properties: { title: "JWT Tokens" } }

// Link TODOs to concepts
memory_add_edge({ source: "todo-1-...", target: "oauth-concept-id", type: "related_to" })
```

## 🛠️ New Tools Available

### Knowledge Graph Tools (8 new tools)

#### 1. `memory_add_node`
Create a node in the knowledge graph.

```json
{
  "type": "person",
  "label": "Jane Smith",
  "properties": {
    "email": "jane@example.com",
    "role": "senior developer"
  }
}
```

#### 2. `memory_add_edge`
Create a relationship between two nodes.

```json
{
  "sourceId": "todo-1-123",
  "targetId": "person-456",
  "type": "assigned_to",
  "properties": {
    "assignedDate": "2025-10-02"
  }
}
```

#### 3. `memory_get_node`
Retrieve a specific node.

```json
{
  "id": "node-1-123"
}
```

#### 4. `memory_query_nodes`
Find nodes matching criteria.

```json
{
  "type": "person",
  "properties": {
    "role": "developer"
  }
}
```

#### 5. `memory_get_neighbors`
Get connected nodes.

```json
{
  "nodeId": "todo-1-123",
  "direction": "both",
  "edgeType": "depends_on"
}
```

#### 6. `memory_get_stats`
Get graph statistics.

```json
{}
```

Returns:
```json
{
  "nodeCount": 15,
  "edgeCount": 23,
  "nodesByType": {
    "todo": 5,
    "person": 3,
    "file": 7
  },
  "edgesByType": {
    "depends_on": 8,
    "assigned_to": 5,
    "references": 10
  }
}
```

#### 7. `memory_export`
Export entire graph.

```json
{}
```

#### 8. `clear_all`
Clear everything (enhanced).

```json
{
  "confirm": true
}
```

## 🔄 Enhanced TODO Tools

### Automatic Graph Integration

**`create_todo`** now has `addToGraph` parameter (default: true):
```json
{
  "title": "Implement login",
  "priority": "high",
  "addToGraph": true  // Automatically creates a graph node
}
```

**`delete_todo`** now has `deleteFromGraph` parameter (default: true):
```json
{
  "id": "todo-1-123",
  "deleteFromGraph": true  // Also removes from graph
}
```

**`update_todo`** automatically updates the graph node if it exists.

## 📖 Complete Workflow Example

```typescript
// 1. Create a project
memory_add_node({
  type: "project",
  label: "E-commerce Platform",
  properties: { status: "active", budget: 50000 }
})
// Returns: node-1-1234567890

// 2. Add team members
memory_add_node({
  type: "person",
  label: "Alice",
  properties: { role: "backend", email: "alice@example.com" }
})
// Returns: node-2-1234567891

memory_add_node({
  type: "person",
  label: "Bob",
  properties: { role: "frontend", email: "bob@example.com" }
})
// Returns: node-3-1234567892

// 3. Create TODOs (automatically added to graph)
create_todo({
  title: "Build API endpoints",
  priority: "high",
  tags: ["backend"],
  addToGraph: true
})
// Returns: todo-1-1234567893

create_todo({
  title: "Design UI components",
  priority: "high",
  tags: ["frontend"],
  addToGraph: true
})
// Returns: todo-2-1234567894

// 4. Link TODOs to project
memory_add_edge({
  source: "node-1-1234567890",  // project
  target: "todo-1-1234567893",  // API TODO
  type: "contains"
})

memory_add_edge({
  source: "node-1-1234567890",  // project
  target: "todo-2-1234567894",  // UI TODO
  type: "contains"
})

// 5. Assign TODOs to people
memory_add_edge({
  source: "node-2-1234567891",  // Alice
  target: "todo-1-1234567893",  // API TODO
  type: "assigned_to"
})

memory_add_edge({
  source: "node-3-1234567892",  // Bob
  target: "todo-2-1234567894",  // UI TODO
  type: "assigned_to"
})

// 6. Add file references
memory_add_node({
  type: "file",
  label: "api/routes.ts",
  properties: { path: "src/api/routes.ts" }
})
// Returns: node-4-1234567895

memory_add_edge({
  source: "todo-1-1234567893",  // API TODO
  target: "node-4-1234567895",  // file
  type: "references"
})

// 7. Query: What's Alice working on?
memory_get_neighbors({
  nodeId: "node-2-1234567891",  // Alice
  direction: "out",
  edgeType: "assigned_to"
})

// 8. Query: What files are related to the API TODO?
memory_get_neighbors({
  nodeId: "todo-1-1234567893",
  direction: "out",
  edgeType: "references"
})

// 9. Query: What's in the project?
memory_get_neighbors({
  nodeId: "node-1-1234567890",  // project
  direction: "out",
  edgeType: "contains"
})

// 10. Get overview
memory_get_stats()
```

## 🚀 How to Enable

### Step 1: Backup Current Server (Optional)

```bash
cd /Users/timothysweet/src/my-mcp-server
cp src/index.ts src/index-v1-backup.ts
```

### Step 2: Replace with KG-Enhanced Version

```bash
cp src/index-with-kg.ts src/index.ts
```

### Step 3: Rebuild

```bash
npm install  # Install graphology if not already installed
npm run build
```

### Step 4: Restart Cursor

Completely quit and restart Cursor to pick up the new server.

### Step 5: Test

Try in Cursor chat:
```
Use memory_get_stats to show me the current knowledge graph statistics
```

## 🎯 Benefits

### 1. **Richer Context**
- Link TODOs to files, people, concepts
- Track dependencies explicitly
- Map project structure

### 2. **Better Queries**
- "What's assigned to Alice?"
- "What TODOs reference this file?"
- "What must be done before this task?"

### 3. **Visualization Ready**
- Export graph structure
- Can be visualized with tools like Cytoscape.js, D3.js
- Ready for Neo4j migration

### 4. **Scalable**
- In-memory for speed
- Can export/import
- Easy migration path to Neo4j

## 🔮 Future Enhancements

### Phase 2: Neo4j Integration

If you need persistent storage and advanced querying:

```typescript
// Replace graphology with Neo4j driver
import neo4j from 'neo4j-driver'

// Run Cypher queries
MATCH (t:Todo)-[:ASSIGNED_TO]->(p:Person {role: 'developer'})
WHERE t.priority = 'high'
RETURN t, p
```

### Phase 3: Advanced Features

- **Path finding**: Find shortest path between nodes
- **Clustering**: Identify related groups
- **Centrality**: Find most important nodes
- **Pattern matching**: Complex graph queries
- **Temporal**: Track changes over time

## 📚 Graph Theory Concepts

### Nodes (Vertices)
Entities in your system. Each has:
- **Type**: What kind of entity
- **Label**: Human-readable name
- **Properties**: Additional metadata
- **ID**: Unique identifier

### Edges (Relationships)
Connections between nodes. Each has:
- **Type**: Kind of relationship
- **Direction**: From source to target
- **Properties**: Relationship metadata

### Neighbors
Nodes connected by edges:
- **In-neighbors**: Edges pointing TO a node
- **Out-neighbors**: Edges pointing FROM a node

### Graph Queries
- **Traversal**: Walk the graph following edges
- **Pattern matching**: Find specific structures
- **Aggregation**: Count, sum, group nodes/edges

## 🎨 Visualization Ideas

You can export the graph and visualize it with:

1. **Cytoscape.js** - Interactive graph visualization
2. **D3.js** - Custom visualizations
3. **vis.js** - Network diagrams
4. **Graphviz** - Static graph images
5. **Neo4j Browser** - If you migrate to Neo4j

Example export usage:
```typescript
// Export graph
const graph = memory_export()

// graph.nodes → array of all nodes
// graph.edges → array of all edges with source/target

// Feed to visualization library
```

## 💡 Best Practices

### 1. Consistent Node Types
- Use predefined types when possible
- Document custom types
- Keep type names descriptive

### 2. Meaningful Edge Types
- Use semantic relationship names
- Be consistent with directionality
- Document what each type means

### 3. Rich Properties
- Store relevant metadata in properties
- Use consistent property names
- Include timestamps when useful

### 4. Regular Cleanup
- Remove obsolete nodes/edges
- Use `memory_get_stats` to monitor size
- Export for backup before major changes

## 🆚 Comparison: Before vs After

### Before (TODO Only)
```
create_todo("Fix bug in auth")
add_todo_note("todo-1", "Related to login.ts")
// Manual tracking of relationships
```

### After (TODO + KG)
```
create_todo("Fix bug in auth")
memory_add_node({ type: "file", properties: { title: "login.ts" } })
memory_add_node({ type: "person", properties: { title: "Alice" } })
memory_add_edge({ source: "todo-1", target: "file-1", type: "references" })
memory_add_edge({ source: "person-1", target: "todo-1", type: "assigned_to" })

// Now you can query:
memory_get_neighbors({ nodeId: "file-1", direction: "in", edgeType: "references" })
// → "Which TODOs reference login.ts?"

memory_get_neighbors("person-1", "out", "assigned_to")
// → "What's Alice working on?"
```

## 📞 Questions?

### Is graphology open source?
Yes! MIT licensed. https://graphology.github.io/

### Can I migrate to Neo4j later?
Yes! The graph structure is compatible. Just swap the storage backend.

### Does this slow down the server?
No. In-memory graph operations are very fast. Graphology is optimized for performance.

### Can I still use the old TODO tools?
Yes! All original tools work exactly the same. KG features are additive.

## 🎉 Ready to Use!

Once you enable the KG-enhanced version, you'll have access to 15 total tools:
- **7 original TODO tools** (unchanged)
- **8 new knowledge graph tools** (added)

Start building rich, interconnected data structures alongside your TODOs! 🚀

