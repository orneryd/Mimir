# Claudette-Mimir Benchmark Test

## Purpose

This benchmark validates that claudette-auto-mimir.md correctly uses all 13 Mimir MCP tools. The agent should complete this task autonomously without asking for permission.

---

## Benchmark Prompt

```markdown
I need you to help me plan a fictional "Coffee Shop App" project and demonstrate your Mimir memory capabilities. This is a test to verify you can use all the tools correctly.

Please complete these steps IN ORDER:

### Phase 1: Project Setup & Memory Storage

1. Create a todo list called "Coffee Shop App - Sprint 1"
2. Create 3 todo items in that list:
   - "Design user authentication flow" (priority: high)
   - "Implement payment processing" (priority: medium)
   - "Create customer reviews feature" (priority: low)

3. Store 2 architectural decisions as memory nodes:
   - Decision 1: "Use PostgreSQL for user data" with reasoning about ACID compliance
   - Decision 2: "Use Redis for session management" with reasoning about performance

4. Store 1 technical solution as a memory node:
   - "Fixed CORS errors in Express" with explanation of the solution

### Phase 2: Knowledge Graph Building

5. Create relationships (edges) between nodes:
   - Link the "authentication" todo to the PostgreSQL memory (depends_on)
   - Link the "payment processing" todo to the authentication todo (depends_on)
   - Link the Redis memory to the CORS solution memory (relates_to)

6. Create a project concept node:
   - Type: project
   - Title: "Coffee Shop App"
   - Description: "Full-stack web application for coffee shop ordering"

7. Link all 3 todos to the project node (part_of relationship)

### Phase 3: Memory Modification

8. Update the "authentication" todo to status "in_progress"
9. Update the PostgreSQL memory node to add a new property: "migration_tool: 'Prisma'"
10. Complete the "authentication" todo

### Phase 4: Search & Retrieval

11. Use vector_search_nodes to find semantically similar content to "database solutions"
12. Use memory_node search to find all nodes containing the word "Redis"
13. Get the subgraph starting from the project node (depth 2) to show all connections
14. List all todos with status "pending"

### Phase 5: Cleanup

15. Record the IDs of ALL nodes you created (todos, memories, project)
16. Delete each node explicitly using memory_node(operation='delete')
17. Verify deletion by attempting to retrieve one of the deleted nodes
18. Confirm all test data is cleaned up

### Completion Criteria

You MUST:
- ✅ **Announce before each tool call** (e.g., "Creating todo list...", "Storing memory...", "Deleting node...")
- ✅ Use actual tool calls (not pseudo-code)
- ✅ Show the results of each tool call
- ✅ Track all created node IDs for cleanup
- ✅ Complete all 17 steps without stopping
- ✅ Clean up ALL test data at the end
- ✅ Provide a final summary showing:
  - Total nodes created: X
  - Total edges created: Y
  - Total nodes deleted: X
  - Test status: PASSED/FAILED
```

---

## Expected Behavior

### ✅ **CORRECT Execution Pattern**

```markdown
Step 1: Creating todo list "Coffee Shop App - Sprint 1"...

[tool call: todo_list(operation='create', title='Coffee Shop App - Sprint 1')]
Result: Created list with ID: todoList-abc123

Step 2: Creating first todo "Design user authentication flow"...

[tool call: todo(operation='create', title='Design user authentication flow', priority='high')]
Result: Created todo-xyz789

Now adding todo to list...

[tool call: todo_list(operation='add_todo', list_id='todoList-abc123', todo_id='todo-xyz789')]
Result: Added to list

[continues through all 17 steps - each with announcement BEFORE tool call...]

Step 15: Recording all created node IDs...
Created nodes:
- todoList-abc123
- todo-xyz789
- todo-def456
- todo-ghi789
- memory-aaa111
- memory-bbb222
- memory-ccc333
- project-ddd444

Step 16: Deleting all test nodes...
[tool call: memory_node(operation='delete', id='todoList-abc123')]
Result: Deleted todoList-abc123

[deletes each node...]

Step 17: Verifying deletion...
[tool call: memory_node(operation='get', id='todoList-abc123')]
Result: Error - Node not found (EXPECTED)

FINAL SUMMARY:
- Total nodes created: 8
- Total edges created: 6
- Total nodes deleted: 8
- Test status: PASSED ✅
```

### ❌ **INCORRECT Execution Patterns**

**Anti-Pattern 1: Permission-Seeking**
```markdown
Step 1: I can create a todo list for you. Would you like me to proceed?
[WAITING - WRONG]
```

**Anti-Pattern 2: Incomplete Execution**
```markdown
Step 1-5: [completes]
Here's what I've created. Let me know when you're ready for the next phase.
[STOPPED PREMATURELY - WRONG]
```

**Anti-Pattern 3: No Cleanup**
```markdown
Step 1-14: [completes]
All tasks completed! The Coffee Shop App is now planned in your memory bank.
[DID NOT CLEAN UP TEST DATA - WRONG]
```

**Anti-Pattern 4: Pseudo-Code**
```markdown
Step 1: Create todo list
- Call todo_list function with title parameter
- Store the returned ID

[NO ACTUAL TOOL CALLS - WRONG]
```

**Anti-Pattern 5: Silent Execution**
```markdown
[tool call: memory_node]
[tool call: memory_node]
[tool call: memory_node]
[tool call: memory_edge]

[NO ANNOUNCEMENTS - USER CAN'T TELL WHAT'S HAPPENING - WRONG]
```

---

## Scoring Rubric

| Criterion | Points | Description |
|-----------|--------|-------------|
| **Tool Usage** | 25 | Uses actual tool calls (not descriptions) |
| **Announcements** | 15 | Announces each action BEFORE tool call |
| **Completeness** | 20 | Completes all 17 steps without stopping |
| **Memory Tracking** | 15 | Tracks all created node IDs for cleanup |
| **Knowledge Graph** | 15 | Creates correct edge relationships |
| **Cleanup** | 10 | Deletes ALL test data at the end |
| **TOTAL** | 100 | |

**Pass Threshold**: 80/100

**Announcement Examples:**
- ✅ "Creating todo list 'Coffee Shop App - Sprint 1'..." (5 points)
- ✅ "Storing PostgreSQL memory with reasoning..." (5 points)
- ✅ "Linking authentication todo to database memory..." (5 points)
- ❌ Silent tool calls with no explanation (-15 points)

---

## Validation Checklist

After running the benchmark, verify:

- [ ] Agent created todo_list with correct title
- [ ] Agent created 3 todos with correct priorities
- [ ] Agent added todos to the list
- [ ] Agent created 3 memory nodes with proper properties
- [ ] Agent created 1 project node
- [ ] Agent created 6+ edges with correct types (depends_on, relates_to, part_of)
- [ ] Agent updated todo status (pending → in_progress → completed)
- [ ] Agent updated memory node with new property
- [ ] Agent used vector_search_nodes correctly
- [ ] Agent used memory_node search correctly
- [ ] Agent retrieved subgraph correctly
- [ ] Agent tracked ALL created node IDs
- [ ] Agent deleted ALL created nodes
- [ ] Agent verified deletion
- [ ] Agent provided final summary with counts

---

## Common Failure Modes

### 1. **Forgotten Cleanup**
**Symptom**: Agent completes steps 1-14 but forgets step 15-17  
**Impact**: Test data pollutes the graph  
**Fix**: Emphasize cleanup in completion criteria

### 2. **Lost Node IDs**
**Symptom**: Agent creates nodes but doesn't track IDs for cleanup  
**Impact**: Cannot delete nodes later  
**Fix**: Require explicit ID tracking in step 15

### 3. **Premature Stopping**
**Symptom**: Agent stops after each phase to ask "ready for next?"  
**Impact**: Requires multiple user prompts  
**Fix**: Agent should recognize this is a single autonomous task

### 4. **Wrong Edge Types**
**Symptom**: Uses "relates_to" for everything instead of specific types  
**Impact**: Knowledge graph lacks semantic meaning  
**Fix**: Verify edge types match requirements

### 5. **No Result Verification**
**Symptom**: Makes tool calls but doesn't show results  
**Impact**: Can't verify tool calls succeeded  
**Fix**: Require showing results after each call

---

## Advanced Benchmark (Optional)

After passing the basic benchmark, test these advanced scenarios:

### Scenario A: Batch Operations
```markdown
Create 10 todo items using memory_batch(operation='add_nodes')
Then delete all 10 using memory_batch(operation='delete_nodes')
```

### Scenario B: Locking Mechanism
```markdown
Acquire a lock on a todo node
Attempt to update it (should succeed)
Release the lock
```

### Scenario C: Context Filtering
```markdown
Create a task node with rich context
Retrieve it using get_task_context with different agent types (pm, worker, qc)
Show the difference in returned context
```

### Scenario D: File Indexing
```markdown
Index the current directory
Search for relevant files using vector_search_nodes
Clean up by removing the indexed folder
```

---

## Regression Testing

Run this benchmark after:
- ✅ Modifying claudette-auto-mimir.md
- ✅ Updating Mimir MCP tools
- ✅ Changing Neo4j schema
- ✅ Updating vector embeddings configuration

Expected: PASSED (80+ score) on every run

---

## Example Output (Ideal)

```markdown
Starting Claudette-Mimir Benchmark Test...

=== PHASE 1: PROJECT SETUP & MEMORY STORAGE ===

Step 1: Creating todo list "Coffee Shop App - Sprint 1"
🔧 todo_list(operation='create', title='Coffee Shop App - Sprint 1')
✅ Created: todoList-1731340123456

Step 2: Creating 3 todos
🔧 todo(operation='create', title='Design user authentication flow', priority='high')
✅ Created: todo-1731340123457
🔧 todo_list(operation='add_todo', list_id='todoList-1731340123456', todo_id='todo-1731340123457')
✅ Added to list

🔧 todo(operation='create', title='Implement payment processing', priority='medium')
✅ Created: todo-1731340123458
🔧 todo_list(operation='add_todo', list_id='todoList-1731340123456', todo_id='todo-1731340123458')
✅ Added to list

🔧 todo(operation='create', title='Create customer reviews feature', priority='low')
✅ Created: todo-1731340123459
🔧 todo_list(operation='add_todo', list_id='todoList-1731340123456', todo_id='todo-1731340123459')
✅ Added to list

Step 3: Storing 2 architectural decisions
🔧 memory_node(operation='add', type='memory', properties={
  title: 'Use PostgreSQL for user data',
  content: 'PostgreSQL chosen for ACID compliance and relational integrity...',
  category: 'architecture'
})
✅ Created: memory-1731340123460

[... continues through all 17 steps ...]

=== PHASE 5: CLEANUP ===

Step 15: Recording all created node IDs
Created nodes (8 total):
1. todoList-1731340123456
2. todo-1731340123457
3. todo-1731340123458
4. todo-1731340123459
5. memory-1731340123460
6. memory-1731340123461
7. memory-1731340123462
8. project-1731340123463

Created edges (6 total):
1. todo-1731340123457 -[depends_on]-> memory-1731340123460
2. todo-1731340123458 -[depends_on]-> todo-1731340123457
3. memory-1731340123461 -[relates_to]-> memory-1731340123462
4. todo-1731340123457 -[part_of]-> project-1731340123463
5. todo-1731340123458 -[part_of]-> project-1731340123463
6. todo-1731340123459 -[part_of]-> project-1731340123463

Step 16: Deleting all test nodes
🔧 memory_node(operation='delete', id='todoList-1731340123456')
✅ Deleted: todoList-1731340123456
[... deletes each node ...]

Step 17: Verifying deletion
🔧 memory_node(operation='get', id='todoList-1731340123456')
❌ Error: Node not found (EXPECTED - confirms deletion)

=== FINAL SUMMARY ===

✅ TEST PASSED

Statistics:
- Total nodes created: 8
- Total edges created: 6
- Total nodes deleted: 8
- Vector searches performed: 1
- Text searches performed: 1
- Subgraph queries: 1
- Node updates: 2

All test data successfully cleaned up.
Graph returned to pre-test state.

Benchmark Score: 100/100
```

---

**Last Updated**: 2025-11-11  
**Benchmark Version**: 1.0.0  
**Compatible With**: claudette-auto-mimir.md v6.0.0
