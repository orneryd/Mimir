"""
title: Mimir Multi-Agent Orchestrator
author: Mimir Team
version: 1.0.0
description: Multi-agent orchestration with Ecko (prompt architect) → PM → Workers → QC
required_open_webui_version: 0.6.34
"""

import os
import json
import asyncio
from typing import List, Dict, Any, Optional, AsyncGenerator
from pydantic import BaseModel, Field

# Module-level request cache (shared across all pipeline instances)
# This prevents duplicate invocations when Open WebUI creates multiple instances
_REQUEST_CACHE = {}
_CACHE_TTL = 3  # seconds


class Pipe:
    """
    Mimir Multi-Agent Orchestration Pipeline

    Workflow:
    1. User Request → Ecko (Prompt Architect) → Structured Prompt
    2. Structured Prompt → PM Agent → Task Decomposition
    3. Tasks → Worker Agents → Execution
    4. Outputs → QC Agent → Verification
    5. Final Report → User
    """

    class Valves(BaseModel):
        """Pipeline configuration"""

        # MCP Server Configuration
        MCP_SERVER_URL: str = Field(
            default="http://mcp-server:3000",
            description="MCP server URL for graph operations",
        )

        # Copilot API Configuration
        COPILOT_API_URL: str = Field(
            default="http://host.docker.internal:4141/v1",
            description="Copilot API base URL",
        )

        COPILOT_API_KEY: str = Field(
            default="sk-copilot-dummy",
            description="Copilot API key (dummy for local server)",
        )

        # MCP Server Configuration
        MCP_SERVER_URL: str = Field(
            default="http://localhost:9042/mcp",
            description="MCP server URL for memory/context retrieval",
        )

        # Agent Configuration
        ECKO_ENABLED: bool = Field(
            default=True, description="Enable Ecko (prompt architect) stage"
        )

        PM_ENABLED: bool = Field(default=True, description="Enable PM (planning) stage")
        
        PM_MODEL: str = Field(
            default="gpt-5-mini",
            description="Model to use for PM agent (planning). Default: gpt-5-mini for faster planning."
        )

        WORKERS_ENABLED: bool = Field(
            default=True, description="Enable worker execution (experimental)"
        )
        
        WORKER_MODEL: str = Field(
            default="gpt-4.1",
            description="Model to use for worker agents (task execution). Default: gpt-4.1 for high-quality output."
        )
        
        QC_MODEL: str = Field(
            default="gpt-4.1",
            description="Model to use for QC agents (verification). Default: gpt-4.1 for thorough validation."
        )

        # Context Enrichment
        SEMANTIC_SEARCH_ENABLED: bool = Field(
            default=True,
            description="Enable semantic search for context enrichment (queries Neo4j directly)",
        )

        SEMANTIC_SEARCH_LIMIT: int = Field(
            default=10, description="Number of relevant context items to retrieve"
        )

        # Model Configuration
        DEFAULT_MODEL: str = Field(
            default="gpt-4.1", description="Default model if none selected"
        )

    def __init__(self):
        self.type = "manifold"
        self.id = "mimir_orchestrator_v2"  # Changed to avoid duplicates
        self.name = "Mimir"
        self.valves = self.Valves()

        # Request deduplication cache (to prevent multiple runs of same request)
        self._request_cache = {}
        self._cache_ttl = 3  # seconds - cache requests for 3 seconds

        # Neo4j connection (lazy initialization)
        self._neo4j_driver = None

        # Load Ecko preamble
        self.ecko_preamble = self._load_ecko_preamble()
        self.pm_preamble = self._load_pm_preamble()

    def _load_ecko_preamble(self) -> str:
        """Load Ecko agent preamble"""
        # Try to load from file (if mounted)
        preamble_paths = [
            "/app/pipelines/../docs/agents/v2/00-ecko-preamble.md",
            "./docs/agents/v2/00-ecko-preamble.md",
        ]

        for path in preamble_paths:
            try:
                with open(path, "r") as f:
                    return f.read()
            except FileNotFoundError:
                continue

        # Fallback: condensed Ecko preamble
        return """# Ecko (Prompt Architect) v2.0

You are **Ecko**, a Prompt Architect who transforms vague user requests into structured, actionable prompts.

## Your Role:
- Extract implicit requirements from terse requests
- Identify technical challenges and decision points
- Generate 3-7 concrete deliverables with formats
- Provide 4-8 guiding questions for PM/workers/QC
- Structure for PM success (not execution)

## Execution Pattern:
1. **Analyze Intent**: What is user ACTUALLY trying to accomplish?
2. **Identify Gaps**: What's missing? What's challenging?
3. **Structure Requirements**: Functional, technical, constraints, success criteria
4. **Define Deliverables**: Name, format, content, purpose
5. **Generate Questions**: Guide PM planning and worker execution

## Output Format (REQUIRED):
```markdown
# Project: [Clear Title]

## Executive Summary
[1-2 sentences: What is being built and why]

## Requirements

### Functional Requirements
1. [What system must DO]
2. [Actions, behaviors, features]

### Technical Constraints
- [Technology, architecture, pattern requirements]
- [Limitations or restrictions]

### Success Criteria
1. [Measurable, verifiable outcome]
2. [How to know when complete]

## Deliverables

### 1. [Deliverable Name]
- **Format:** [File type, schema]
- **Content:** [What it must contain]
- **Purpose:** [How it's used downstream]

### 2. [Deliverable Name]
- **Format:** [File type, schema]
- **Content:** [What it must contain]
- **Purpose:** [How it's used downstream]

[... 3-7 deliverables total ...]

## Context

### Existing System
- [Current state, tech stack, architecture]
- [Integration points, dependencies]

### Technical Considerations

#### [Challenge Category 1]
- [Specific challenge or question]
- [Why it's challenging]
- [Potential approaches]

#### [Challenge Category 2]
- [Specific challenge or question]
- [Why it's challenging]
- [Potential approaches]

## Questions to Address in Design

1. **[Technology Selection]:** [Specific question PM must answer]
2. **[Design Pattern]:** [Specific question PM must answer]
3. **[Integration]:** [Specific question PM must answer]
4. **[Scalability]:** [Specific question PM must answer]

[4-8 questions total]

## Output Format
Please provide:
1. **[Deliverable 1]** ([Format])
2. **[Deliverable 2]** ([Format])
3. **[Deliverable 3]** ([Format])

## Estimated Complexity
- [Component 1]: [Low/Medium/High] ([Reason])
- [Component 2]: [Low/Medium/High] ([Reason])
```

## Key Patterns:
- **Expand Terse Requests**: "[Action] [System]" → Functional + Technical + Constraints + Deliverables
- **Extract Hidden Constraints**: "for [User Type]" → Auth, access control, filtering
- **Identify Challenges**: "[Tech X] for [Purpose Y], no [Tech Z]" → Trade-offs, risks
- **Generate Deliverables**: "[Action] the [System]" → Architecture doc, API spec, component design, roadmap
- **Surface Decisions**: "use [Technology]" → Option A vs B vs C, criteria, trade-offs

## Success Criteria:
- [ ] User intent clearly identified
- [ ] All implicit requirements made explicit
- [ ] Technical challenges identified
- [ ] 3-7 concrete deliverables defined with formats
- [ ] 4-8 guiding questions generated
- [ ] Structured prompt follows output format
- [ ] Comprehensive enough for PM to decompose into tasks

**Version:** 2.0.0 (Condensed for Open WebUI)
"""

    def _load_pm_preamble(self) -> str:
        """Load PM agent preamble - hardcoded full version"""
        # Full PM preamble v2.0 - hardcoded for Open WebUI deployment
        return """# PM (Project Manager) Agent Preamble v2.0

You are a **Project Manager** who decomposes requirements into executable task graphs for multi-agent workflows.

## Your Goal:
Transform structured prompts into atomic tasks with clear success criteria, role definitions, and dependency mappings. Each task must be independently executable by a worker agent.

## Critical Rules:
1. **ATOMIC TASKS ONLY** - Each task: 10-50 tool calls (not 1, not 200)
2. **MEASURABLE SUCCESS CRITERIA** - Every criterion verifiable with a tool command
3. **SPECIFIC ROLE DESCRIPTIONS** - 10-20 word role descriptions (not generic)
4. **ESTIMATE TOOL CALLS** - Conservative estimates for circuit breaker limits
5. **MAP DEPENDENCIES** - Explicitly state which tasks must complete before this one
6. **USE EXACT OUTPUT FORMAT** - Follow structured format exactly
7. **NO CODE GENERATION** - Workers use existing tools, not new scripts

## Execution Pattern:

### Step 1: Requirements Analysis
<reasoning>
- Core requirement: [Primary goal]
- Explicit requirements: [List as 1., 2., 3.]
- Implicit requirements: [What's needed but not stated]
- Constraints: [Limitations, performance, security]
- Estimated total tasks: [N tasks including task-0]
</reasoning>

### Step 2: Task Decomposition
- **Atomic Tasks:** 10-50 tool calls each
- **No Monoliths:** Don't create tasks requiring >100 tool calls
- **No Micro-Tasks:** Don't create tasks requiring <5 tool calls
- **Tool-Based:** Use existing tools (read_file, run_terminal_cmd, grep, etc.)

### Step 3: Dependency Mapping
- **Sequential:** B requires A's output (A → B)
- **Parallel:** A and B are independent (A || B)
- **Convergent:** C requires both A and B (A → C ← B)

### Step 4: Role Definition
**Worker Role Pattern:**
```
[Domain expert] with [specific skills] who specializes in [task type]
```

**QC Role Pattern:**
```
[Verification specialist] who adversarially verifies [specific aspect] using [verification methods]
```

### Step 5: Success Criteria (SMART)
```markdown
**Success Criteria:**
- [ ] Specific: File `src/service.ts` exists with ServiceClass
- [ ] Measurable: Class has method1(), method2() with type signatures
- [ ] Achievable: Unit tests in `src/service.spec.ts` pass (100%)
- [ ] Relevant: Linting passes with 0 errors
- [ ] Testable: Build completes successfully
```

**Verification Criteria:**
```markdown
**Verification Criteria:**
- [ ] (30 pts) All tests pass: `run_terminal_cmd('npm test')`
- [ ] (30 pts) Required files exist: `read_file('src/service.ts')`
- [ ] (20 pts) Linting passes: `run_terminal_cmd('npm run lint')`
- [ ] (20 pts) Build succeeds: `run_terminal_cmd('npm run build')`
```

## Output Format (REQUIRED):

```markdown
# Task Decomposition Plan

## Project Overview
**Goal:** [One sentence high-level objective]
**Complexity:** Simple | Medium | Complex
**Total Tasks:** [N] tasks (including task-0)
**Estimated Duration:** [Total time]
**Estimated Tool Calls:** [Sum across all tasks]

---

## Task Graph

**Task ID:** task-0

**Title:** Environment Validation

**Agent Role Description:** DevOps engineer with system validation and dependency checking expertise

**Recommended Model:** gpt-4.1

**Prompt:**
Execute ALL 4 validations in order:
[ ] 1. Tool Availability: `run_terminal_cmd('which node')`, `run_terminal_cmd('which npm')`
[ ] 2. Dependencies: `run_terminal_cmd('npm list --depth=0')`
[ ] 3. Build System: `run_terminal_cmd('npm run build')`
[ ] 4. Configuration: `read_file('package.json')`

CRITICAL: All 4 must be completed or task fails.

**Success Criteria:**
- [ ] All commands executed (not described)
- [ ] All validations passed or failures documented
- [ ] Environment confirmed ready or blockers identified

**Dependencies:** None

**Estimated Duration:** 5 minutes

**Estimated Tool Calls:** 8

**Parallel Group:** N/A

**QC Agent Role Description:** Infrastructure validator who verifies actual command execution and dependency availability

**Verification Criteria:**
- [ ] (40 pts) All validation commands executed: verify tool call count > 5
- [ ] (30 pts) Dependencies checked: verify npm list output
- [ ] (30 pts) Configuration files read: verify file contents returned

**Max Retries:** 2

---

**Task ID:** task-1.1

**Title:** [Concise task title]

**Agent Role Description:** [Domain expert] with [specific skills] specializing in [task type]

**Recommended Model:** gpt-4.1

**Prompt:**
[Detailed task instructions]

**Context:**
[What the worker needs to know]

**Tool-Based Execution:**
- Use: [list of tools to use]
- Execute: [what actions to take]
- Store: [what to return/save]

**Success Criteria:**
- [ ] [Specific, measurable criterion 1]
- [ ] [Specific, measurable criterion 2]

**Dependencies:** task-0

**Estimated Duration:** [N] minutes

**Estimated Tool Calls:** [N]

**Parallel Group:** 1

**QC Agent Role Description:** [Verification specialist] who verifies [aspect] using [methods]

**Verification Criteria:**
- [ ] ([points]) [Criterion with tool command]
- [ ] ([points]) [Criterion with tool command]

**Max Retries:** 3

---

[... more tasks ...]

---

## Dependency Summary

**Critical Path:** task-0 → task-1.1 → task-1.3 → task-2.1
**Parallel Groups:**
- Group 1: task-1.1
- Group 2: task-1.2, task-1.3 (can run simultaneously)

**Mermaid Diagram:**
```mermaid
graph LR
  task-0[Task 0] --> task-1.1[Task 1.1]
  task-1.1 --> task-1.2[Task 1.2]
  task-1.1 --> task-1.3[Task 1.3]
  task-1.2 --> task-2.1[Task 2.1]
  task-1.3 --> task-2.1
```

---

## Summary Table

| ID | Title | Dependencies | Parallel Group | Est. Duration | Est. Tool Calls |
|----|-------|--------------|----------------|---------------|-----------------|
| task-0 | Environment Validation | None | N/A | 5 min | 8 |
| task-1.1 | [Title] | task-0 | 1 | 15 min | 20 |
| task-1.2 | [Title] | task-1.1 | 2 | 10 min | 15 |

---

**All [N] requirements decomposed. [M] tasks ready for execution.**
```

## Success Criteria:
- [ ] Task-0 included with imperative validation commands
- [ ] All tasks are atomic (10-50 tool calls each)
- [ ] All tasks have specific role descriptions (10-20 words)
- [ ] All tasks have measurable success criteria
- [ ] All tasks have tool call estimates
- [ ] Dependencies mapped correctly (no circular deps)
- [ ] Output follows exact format (parseable)

**Version:** 2.0.0 (Condensed for Open WebUI)
"""

    async def pipes(self) -> List[Dict[str, str]]:
        """Return available pipeline models"""
        return [
            {"id": "mimir:ecko-only", "name": "Ecko Only (Prompt Architect)"},
            {"id": "mimir:ecko-pm", "name": "Ecko → PM (Planning)"},
            {"id": "mimir:full", "name": "Full Orchestration (Experimental)"},
        ]

    async def pipe(
        self,
        body: Dict[str, Any],
        __user__: Optional[Dict[str, Any]] = None,
        __event_emitter__=None,
        __task__: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Main pipeline execution"""

        import time
        import hashlib

        # Extract user message and selected model
        messages = body.get("messages", [])
        if not messages:
            yield "Error: No messages provided"
            return

        user_message = messages[-1].get("content", "")

        # Create request fingerprint for deduplication
        request_key = hashlib.md5(
            f"{user_message}:{body.get('model', '')}".encode()
        ).hexdigest()
        current_time = time.time()

        # Check if this is a duplicate request within cache TTL
        if request_key in self._request_cache:
            cached_time = self._request_cache[request_key]
            if current_time - cached_time < self._cache_ttl:
                print(
                    f"⚠️ DUPLICATE REQUEST DETECTED - Ignoring (cached {current_time - cached_time:.1f}s ago)"
                )
                yield "\n\n**⚠️ Duplicate request detected - pipeline already running for this message**\n\n"
                return

        # Cache this request
        self._request_cache[request_key] = current_time

        # Clean up old cache entries (older than TTL)
        self._request_cache = {
            k: v
            for k, v in self._request_cache.items()
            if current_time - v < self._cache_ttl
        }

        print(
            f"✅ Processing request: {request_key[:8]}... (cache size: {len(self._request_cache)})"
        )

        # Get selected model from body (this is the model selected in Open WebUI dropdown)
        selected_model = body.get("model", self.valves.DEFAULT_MODEL)

        # Clean up model name - remove function prefix if present
        # Open WebUI may prefix with "test_function." or similar
        if "." in selected_model:
            selected_model = selected_model.split(".", 1)[1]

        # Determine pipeline mode and actual LLM model
        if selected_model.startswith("mimir:"):
            # User selected a Mimir pipeline mode
            pipeline_mode = selected_model.replace("mimir:", "")

            # The actual LLM model should be in the body under a different key
            # or we need to ask the user to select it separately
            # For now, use the default model from valves
            actual_model = self.valves.DEFAULT_MODEL

            # Try to get from user's last model selection (if available in messages)
            for msg in reversed(messages[:-1]):
                if "model" in msg:
                    msg_model = msg["model"]
                    # Clean up model name
                    if "." in msg_model:
                        msg_model = msg_model.split(".", 1)[1]
                    # Check if it's not a mimir pipeline
                    if not msg_model.startswith("mimir:"):
                        actual_model = msg_model
                        break

            selected_model = actual_model
        else:
            # User selected a regular model, use default pipeline mode
            pipeline_mode = "ecko-pm"

        # Debug info
        yield f"\n\n**Debug Info:**\n"
        yield f"- Pipeline Mode: `{pipeline_mode}`\n"
        yield f"- Selected Model: `{selected_model}`\n"
        yield f"- Copilot API: `{self.valves.COPILOT_API_URL}`\n\n"

        # Emit status
        if __event_emitter__:
            await __event_emitter__(
                {
                    "type": "status",
                    "data": {
                        "description": f"🎯 Mimir Orchestrator ({pipeline_mode}) using {selected_model}",
                        "done": False,
                    },
                }
            )

        # Stage 1: Ecko (Prompt Architect)
        if self.valves.ECKO_ENABLED and pipeline_mode in [
            "ecko-only",
            "ecko-pm",
            "full",
        ]:
            # Fetch relevant context BEFORE starting Ecko
            relevant_context = ""
            if self.valves.SEMANTIC_SEARCH_ENABLED:
                if __event_emitter__:
                    await __event_emitter__(
                        {
                            "type": "status",
                            "data": {
                                "description": "🔍 Fetching relevant context from memory bank...",
                                "done": False,
                            },
                        }
                    )

                # Actually fetch the context here (blocking)
                relevant_context = await self._get_relevant_context(user_message)

                # Show what we found
                if relevant_context:
                    context_count = relevant_context.count("### Context")
                    yield f"\n\n**📚 Retrieved {context_count} relevant context items from memory bank**\n\n"
                else:
                    yield f"\n\n**📭 No relevant context found in memory bank**\n\n"

            if __event_emitter__:
                await __event_emitter__(
                    {
                        "type": "status",
                        "data": {
                            "description": "🎨 Ecko: Analyzing request with context...",
                            "done": False,
                        },
                    }
                )

            ecko_output = ""
            ecko_raw_content = ""  # Raw LLM output without formatting
            async for chunk in self._call_ecko_with_context(
                user_message, relevant_context, selected_model, __event_emitter__
            ):
                ecko_output += chunk
                # Extract raw content (skip headers and code fences)
                if not chunk.startswith("#") and not chunk.startswith("```"):
                    ecko_raw_content += chunk
                yield chunk

            # Stop here if ecko-only mode
            if pipeline_mode == "ecko-only":
                if __event_emitter__:
                    await __event_emitter__(
                        {
                            "type": "status",
                            "data": {"description": "✅ Ecko complete", "done": True},
                        }
                    )
                return

            # Extract just the markdown content (remove code fences and headers)
            # This is the structured prompt that goes to PM
            # Parse out the content between ```markdown and ```
            import re
            markdown_match = re.search(r'```markdown\n(.*?)\n```', ecko_output, re.DOTALL)
            if markdown_match:
                pm_input = markdown_match.group(1).strip()
            else:
                # Fallback: use the raw content
                pm_input = ecko_raw_content.strip() if ecko_raw_content else ecko_output
        else:
            # Skip Ecko, use raw user message
            pm_input = user_message

        # Stage 2: PM (Project Manager)
        if self.valves.PM_ENABLED and pipeline_mode in ["ecko-pm", "full"]:
            if __event_emitter__:
                await __event_emitter__(
                    {
                        "type": "status",
                        "data": {
                            "description": "📋 PM: Creating task plan...",
                            "done": False,
                        },
                    }
                )

            pm_output = ""
            # Use configured PM model (default: gpt-5-mini for faster planning)
            pm_model = self.valves.PM_MODEL
            async for chunk in self._call_pm(pm_input, pm_model):
                pm_output += chunk
                yield chunk

            # Stop here if ecko-pm mode
            if pipeline_mode == "ecko-pm":
                if __event_emitter__:
                    await __event_emitter__(
                        {
                            "type": "status",
                            "data": {
                                "description": "✅ Planning complete",
                                "done": True,
                            },
                        }
                    )
                return

        # Stage 3: Workers (if enabled and full mode)
        if self.valves.WORKERS_ENABLED and pipeline_mode == "full":
            if __event_emitter__:
                await __event_emitter__(
                    {
                        "type": "status",
                        "data": {
                            "description": "⚙️ Workers: Parsing tasks...",
                            "done": False,
                        },
                    }
                )

            try:
                # Debug: Log PM output length and preview
                print(f"📊 PM Output Length: {len(pm_output)} characters")
                print(f"📊 PM Output Preview (first 500 chars): {pm_output[:500]}")
                print(f"📊 PM Output Preview (last 500 chars): {pm_output[-500:]}")
                
                # Parse tasks from PM output
                tasks = self._parse_pm_tasks(pm_output)
                
                print(f"📊 Parsed {len(tasks)} tasks")
                if tasks:
                    print(f"📊 Task IDs: {[t['id'] for t in tasks]}")
                    
                    # Create todoList for this orchestration run
                    import time
                    orchestration_id = f"orchestration-{int(time.time())}"
                    todolist_id = await self._create_todolist_in_graph(orchestration_id, user_message)
                    
                    # Make task IDs globally unique by prefixing with orchestration ID
                    # This allows historical tracking of every execution
                    for task in tasks:
                        task['original_id'] = task['id']  # Keep original for display
                        task['id'] = f"{orchestration_id}-{task['id']}"  # Make globally unique
                        
                        # CRITICAL: Also update dependency IDs to match the new unique IDs
                        if task.get('dependencies'):
                            task['dependencies'] = [
                                f"{orchestration_id}-{dep_id}" for dep_id in task['dependencies']
                            ]
                    
                    # Create tasks in Neo4j graph (Phase 1: Task Initialization)
                    print(f"💾 Creating {len(tasks)} tasks in graph...")
                    for task in tasks:
                        await self._create_task_in_graph(task, todolist_id, orchestration_id)
                    
                    # Create dependency relationships between todos
                    print(f"🔗 Creating dependency relationships...")
                    for task in tasks:
                        if task.get('dependencies'):
                            for dep_id in task['dependencies']:
                                # Update dependency IDs to use unique IDs
                                unique_dep_id = f"{orchestration_id}-{dep_id}"
                                await self._create_dependency_edge(task['id'], unique_dep_id)
                
                if not tasks:
                    yield "\n\n## ⚙️ Worker Execution\n\n"
                    yield "❌ No tasks found in PM output. This may be because:\n"
                    yield "- PM output was incomplete or cut off\n"
                    yield "- Task format doesn't match expected pattern\n"
                    yield f"\n**PM Output Length:** {len(pm_output)} characters\n"
                    yield f"\n**PM Output Preview (first 500 chars):**\n```\n{pm_output[:500]}\n```\n"
                    yield f"\n**PM Output Preview (last 500 chars):**\n```\n{pm_output[-500:]}\n```\n"
                else:
                    yield f"\n\n## ⚙️ Worker Execution ({len(tasks)} tasks)\n\n"
                    yield f"**Parsed Task IDs:** {', '.join([t['id'] for t in tasks])}\n\n"
                    
                    # Execute tasks in parallel groups using configured worker model
                    worker_model = self.valves.WORKER_MODEL
                    async for chunk in self._execute_tasks(tasks, worker_model, __event_emitter__):
                        yield chunk
            except Exception as e:
                yield f"\n\n## ⚙️ Worker Execution\n\n"
                yield f"❌ **Error during task execution:** {str(e)}\n\n"
                import traceback
                yield f"```\n{traceback.format_exc()}\n```\n"

        # Final status
        if __event_emitter__:
            await __event_emitter__(
                {
                    "type": "status",
                    "data": {"description": "✅ Orchestration complete", "done": True},
                }
            )

    async def _get_relevant_context(self, query: str) -> str:
        """Retrieve relevant context from Neo4j using semantic search (direct query)"""
        if not self.valves.SEMANTIC_SEARCH_ENABLED:
            return ""

        try:
            print(f"🔍 Semantic search: {query[:60]}...")

            # Import neo4j driver
            from neo4j import AsyncGraphDatabase

            # Neo4j connection details
            uri = "bolt://neo4j_db:7687"
            username = "neo4j"
            password = os.getenv("NEO4J_PASSWORD", "password")

            # Create embedding for the query using Ollama
            embedding = await self._get_embedding(query)
            if not embedding:
                print("⚠️ Failed to generate embedding")
                return ""

            # Connect to Neo4j and run vector search
            async with AsyncGraphDatabase.driver(
                uri, auth=(username, password)
            ) as driver:
                async with driver.session() as session:
                    # Cypher query for vector similarity search (manual cosine similarity)
                    # Separate limits for files/chunks (10) and other nodes (10)
                    cypher = """
                    MATCH (n)
                    WHERE n.embedding IS NOT NULL
                    WITH n,
                         reduce(dot = 0.0, i IN range(0, size(n.embedding)-1) | 
                            dot + n.embedding[i] * $embedding[i]) AS dotProduct,
                         sqrt(reduce(sum = 0.0, x IN n.embedding | sum + x * x)) AS normA,
                         sqrt(reduce(sum = 0.0, x IN $embedding | sum + x * x)) AS normB
                    WITH n, dotProduct / (normA * normB) AS similarity
                    WHERE similarity > 0.4
                    OPTIONAL MATCH (parent)-[:HAS_CHUNK]->(n)
                    WITH n, similarity, parent,
                         CASE 
                           WHEN n:file OR n:file_chunk THEN 'file'
                           ELSE 'other'
                         END as category
                    ORDER BY similarity DESC
                    WITH category, collect({node: n, similarity: similarity, parent: parent})[0..10] as items
                    UNWIND items as item
                    RETURN item.node as n, item.similarity as similarity, item.parent as parent
                    ORDER BY similarity DESC
                    """

                    result = await session.run(
                        cypher,
                        embedding=embedding
                    )

                    records = await result.data()

                    if not records:
                        print("📭 No relevant context found")
                        return ""

                    print(f"✅ Found {len(records)} relevant items")

                    # Format context
                    context_parts = []
                    for i, record in enumerate(records, 1):
                        node = record["n"]
                        similarity = record["similarity"]
                        parent = record.get("parent")  # Parent file (if this is a chunk)

                        node_type = node.get("type", "unknown")
                        title = node.get("title", node.get("name", "Untitled"))
                        content = node.get("content", node.get("description", ""))
                        file_path = node.get("filePath", node.get("path", ""))
                        
                        # For file_chunk nodes without metadata, use text content
                        if node_type == "file_chunk" and title == "Untitled":
                            # file_chunk nodes may only have 'text' property, no parent metadata
                            chunk_text = node.get("text", content)
                            if chunk_text:
                                # Use first meaningful line as title
                                lines = [l.strip() for l in chunk_text.split('\n') if l.strip() and len(l.strip()) > 10]
                                if lines:
                                    title = f"{lines[0][:60]}..." if len(lines[0]) > 60 else lines[0]
                                    node_type = "file_chunk (orphaned)"
                        
                        # If this is a file chunk, get parent file info
                        if parent:
                            parent_path = parent.get("filePath", parent.get("path", ""))
                            parent_name = parent.get("name", parent.get("title", ""))
                            
                            # Extract filename from parent path if name is missing
                            if not parent_name and parent_path:
                                parent_name = parent_path.split("/")[-1]
                            
                            # Use parent file name as the title
                            if parent_name and parent_name != "Untitled":
                                if parent_path:
                                    title = f"{parent_name} (chunk from {parent_path})"
                                else:
                                    title = f"{parent_name} (chunk)"
                                node_type = "file_chunk"
                            elif not parent_name:
                                # Debug parent properties
                                print(f"⚠️ Parent has no name - Keys: {list(parent.keys())[:10]}")
                        
                        # If still untitled but has a file path, extract filename
                        if title == "Untitled" and file_path:
                            title = file_path.split("/")[-1]
                        
                        # Last resort: use node ID or first few chars of content
                        if title == "Untitled":
                            node_id = node.get("id", "")
                            if node_id:
                                title = f"Document {node_id[:8]}"
                            elif content:
                                # Use first line of content as title
                                first_line = content.split('\n')[0][:50]
                                title = f"{first_line}..." if len(first_line) == 50 else first_line

                        # Truncate long content
                        if len(content) > 500:
                            content = content[:500] + "..."

                        context_parts.append(
                            f"""### Context {i} (similarity: {similarity:.2f})
**Type:** {node_type}
**Title:** {title}
**Content:**
{content}
"""
                        )

                    return "\n\n".join(context_parts)

        except Exception as e:
            # Log error but don't break the pipeline
            print(f"⚠️ Semantic search error: {str(e)}")
            import traceback

            traceback.print_exc()
            return ""

    async def _get_embedding(self, text: str) -> list:
        """Generate embedding for text using Ollama"""
        try:
            import aiohttp

            # Use host.docker.internal to access Ollama on host machine
            url = "http://host.docker.internal:11434/api/embeddings"
            payload = {"model": "mxbai-embed-large", "prompt": text}

            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data.get("embedding", [])
                    else:
                        print(f"⚠️ Ollama embedding failed: {response.status}")
                        return []
        except Exception as e:
            print(f"⚠️ Embedding error: {str(e)}")
            return []
    
    async def _create_todolist_in_graph(self, orchestration_id: str, user_message: str) -> str:
        """Create todoList for orchestration run"""
        try:
            from neo4j import AsyncGraphDatabase
            import time
            
            uri = "bolt://neo4j_db:7687"
            username = "neo4j"
            password = os.getenv("NEO4J_PASSWORD", "password")
            
            todolist_id = f"todoList-{orchestration_id}"
            
            async with AsyncGraphDatabase.driver(uri, auth=(username, password)) as driver:
                async with driver.session() as session:
                    # Create unique todoList for each orchestration run
                    cypher = """
                    CREATE (tl:todoList {
                        id: $id,
                        type: 'todoList',
                        title: $title,
                        description: $description,
                        archived: false,
                        priority: 'high',
                        orchestrationId: $orchestration_id,
                        createdAt: datetime($created_at)
                    })
                    RETURN tl.id as id
                    """
                    
                    result = await session.run(
                        cypher,
                        id=todolist_id,
                        orchestration_id=orchestration_id,
                        title=f"Orchestration: {user_message[:50]}...",
                        description=f"Multi-agent orchestration run for: {user_message}",
                        created_at=time.strftime('%Y-%m-%dT%H:%M:%S')
                    )
                    
                    record = await result.single()
                    print(f"✅ Created todoList in graph: {record['id']}")
                    return todolist_id
        except Exception as e:
            print(f"⚠️ Failed to create todoList in graph: {str(e)}")
            return None
    
    async def _create_task_in_graph(self, task: dict, todolist_id: str, orchestration_id: str) -> bool:
        """Create todo node in Neo4j graph and link to todoList (Phase 1: Task Initialization)"""
        try:
            from neo4j import AsyncGraphDatabase
            import time
            
            uri = "bolt://neo4j_db:7687"
            username = "neo4j"
            password = os.getenv("NEO4J_PASSWORD", "password")
            
            async with AsyncGraphDatabase.driver(uri, auth=(username, password)) as driver:
                async with driver.session() as session:
                    # Create todo node with globally unique ID for historical tracking
                    # Each execution creates a new node - no MERGE needed
                    cypher = """
                    MATCH (tl:todoList {id: $todolist_id})
                    CREATE (t:todo {
                        id: $id,
                        type: 'todo',
                        title: $title,
                        description: $prompt,
                        status: 'pending',
                        priority: 'medium',
                        orchestrationId: $orchestration_id,
                        originalTaskId: $original_task_id,
                        workerRole: $worker_role,
                        qcRole: $qc_role,
                        verificationCriteria: $verification_criteria,
                        dependencies: $dependencies,
                        parallelGroup: $parallel_group,
                        attemptNumber: 0,
                        maxRetries: 2,
                        createdAt: datetime($created_at)
                    })
                    CREATE (tl)-[:contains]->(t)
                    RETURN t.id as id
                    """
                    
                    result = await session.run(
                        cypher,
                        todolist_id=todolist_id,
                        id=task['id'],
                        orchestration_id=orchestration_id,
                        original_task_id=task.get('original_id', task['id']),
                        title=task.get('title', ''),
                        prompt=task.get('prompt', ''),
                        worker_role=task.get('worker_role', 'Worker agent'),
                        qc_role=task.get('qc_role', 'QC agent'),
                        verification_criteria=task.get('verification_criteria', ''),
                        dependencies=task.get('dependencies', []),
                        parallel_group=task.get('parallel_group'),
                        created_at=time.strftime('%Y-%m-%dT%H:%M:%S')
                    )
                    
                    record = await result.single()
                    print(f"✅ Created todo in graph: {record['id']}")
                    return True
        except Exception as e:
            print(f"⚠️ Failed to create todo in graph: {str(e)}")
            return False
    
    async def _create_dependency_edge(self, task_id: str, dependency_id: str) -> bool:
        """Create depends_on relationship between todos"""
        try:
            from neo4j import AsyncGraphDatabase
            
            uri = "bolt://neo4j_db:7687"
            username = "neo4j"
            password = os.getenv("NEO4J_PASSWORD", "password")
            
            async with AsyncGraphDatabase.driver(uri, auth=(username, password)) as driver:
                async with driver.session() as session:
                    cypher = """
                    MATCH (t1:todo {id: $task_id})
                    MATCH (t2:todo {id: $dependency_id})
                    CREATE (t1)-[:depends_on]->(t2)
                    RETURN t1.id as from, t2.id as to
                    """
                    
                    result = await session.run(
                        cypher,
                        task_id=task_id,
                        dependency_id=dependency_id
                    )
                    
                    record = await result.single()
                    if record:
                        print(f"✅ Created dependency: {record['from']} → {record['to']}")
                        return True
                    return False
        except Exception as e:
            print(f"⚠️ Failed to create dependency edge: {str(e)}")
            return False
    
    async def _update_task_status(self, task_id: str, status: str, updates: dict = None) -> bool:
        """Update task status in Neo4j graph"""
        try:
            from neo4j import AsyncGraphDatabase
            import time
            
            uri = "bolt://neo4j_db:7687"
            username = "neo4j"
            password = os.getenv("NEO4J_PASSWORD", "password")
            
            async with AsyncGraphDatabase.driver(uri, auth=(username, password)) as driver:
                async with driver.session() as session:
                    # Build SET clause dynamically
                    set_clauses = ["t.status = $status"]
                    params = {"task_id": task_id, "status": status}
                    
                    if updates:
                        for key, value in updates.items():
                            set_clauses.append(f"t.{key} = ${key}")
                            params[key] = value
                    
                    cypher = f"""
                    MATCH (t:todo {{id: $task_id}})
                    SET {', '.join(set_clauses)}
                    RETURN t.id as id, t.status as status
                    """
                    
                    result = await session.run(cypher, **params)
                    record = await result.single()
                    
                    if record:
                        print(f"✅ Updated task {record['id']}: {record['status']}")
                        return True
                    else:
                        print(f"⚠️ Task not found: {task_id}")
                        return False
        except Exception as e:
            print(f"⚠️ Failed to update task status: {str(e)}")
            return False
    
    async def _store_worker_output(self, task_id: str, output: str, attempt_number: int, metrics: dict = None) -> bool:
        """Store worker output in graph (Phase 3: Worker Complete)"""
        try:
            from neo4j import AsyncGraphDatabase
            import time
            
            uri = "bolt://neo4j_db:7687"
            username = "neo4j"
            password = os.getenv("NEO4J_PASSWORD", "password")
            
            # Truncate output to 50k chars as per architecture
            truncated_output = output[:50000] if len(output) > 50000 else output
            
            updates = {
                "workerOutput": truncated_output,
                "attemptNumber": attempt_number,
                "workerCompletedAt": time.strftime('%Y-%m-%dT%H:%M:%S')
            }
            
            if metrics:
                updates.update(metrics)
            
            return await self._update_task_status(task_id, "worker_completed", updates)
        except Exception as e:
            print(f"⚠️ Failed to store worker output: {str(e)}")
            return False
    
    async def _store_qc_result(self, task_id: str, qc_result: dict, attempt_number: int) -> bool:
        """Store QC verification result in graph (Phase 6: QC Complete)"""
        try:
            from neo4j import AsyncGraphDatabase
            import time
            import json
            
            uri = "bolt://neo4j_db:7687"
            username = "neo4j"
            password = os.getenv("NEO4J_PASSWORD", "password")
            
            status = "qc_passed" if qc_result['passed'] else "qc_failed"
            
            updates = {
                "qcScore": qc_result['score'],
                "qcPassed": qc_result['passed'],
                "qcFeedback": qc_result['feedback'],
                "qcIssues": qc_result.get('issues', []),
                "qcRequiredFixes": qc_result.get('required_fixes', []),
                "qcCompletedAt": time.strftime('%Y-%m-%dT%H:%M:%S'),
                "qcAttemptNumber": attempt_number
            }
            
            return await self._update_task_status(task_id, status, updates)
        except Exception as e:
            print(f"⚠️ Failed to store QC result: {str(e)}")
            return False
    
    async def _mark_task_completed(self, task_id: str, final_result: dict) -> bool:
        """Mark task as completed with success analysis nodes (Phase 8: Task Success)"""
        try:
            import time
            from neo4j import AsyncGraphDatabase
            
            uri = "bolt://neo4j_db:7687"
            username = "neo4j"
            password = os.getenv("NEO4J_PASSWORD", "password")
            
            updates = {
                "qcScore": final_result.get('qc_score', 0),
                "qcPassed": True,
                "qcFeedback": final_result.get('qc_feedback', ''),
                "verifiedAt": time.strftime('%Y-%m-%dT%H:%M:%S'),
                "totalAttempts": final_result.get('attempts', 1),
                "qcPassedOnAttempt": final_result.get('attempts', 1)
            }
            
            # Update task status
            await self._update_task_status(task_id, "completed", updates)
            
            # Create success analysis node and link it to the completed task
            async with AsyncGraphDatabase.driver(uri, auth=(username, password)) as driver:
                async with driver.session() as session:
                    cypher = """
                    MATCH (t:todo {id: $task_id})
                    CREATE (s:memory {
                        id: $success_id,
                        type: 'memory',
                        title: $title,
                        content: $content,
                        category: 'success_analysis',
                        taskId: $task_id,
                        qcScore: $qc_score,
                        totalAttempts: $total_attempts,
                        passedOnAttempt: $passed_on_attempt,
                        createdAt: datetime($created_at)
                    })
                    CREATE (t)-[:has_success_analysis]->(s)
                    
                    // Extract key success factors from QC feedback
                    WITH t, s
                    UNWIND $success_factors as factor
                    CREATE (f:memory {
                        id: $task_id + '-factor-' + toString(id(f)),
                        type: 'memory',
                        title: 'Success Factor',
                        content: factor,
                        category: 'success_factor',
                        taskId: $task_id,
                        createdAt: datetime($created_at)
                    })
                    CREATE (s)-[:identified_factor]->(f)
                    
                    RETURN s.id as success_id, count(f) as factor_count
                    """
                    
                    # Extract success factors from QC feedback
                    qc_feedback = final_result.get('qc_feedback', '')
                    success_factors = []
                    
                    # Parse QC feedback for positive indicators
                    if 'well-structured' in qc_feedback.lower():
                        success_factors.append("Well-structured output")
                    if 'comprehensive' in qc_feedback.lower():
                        success_factors.append("Comprehensive coverage")
                    if 'accurate' in qc_feedback.lower():
                        success_factors.append("Accurate information")
                    if 'clear' in qc_feedback.lower():
                        success_factors.append("Clear communication")
                    if 'complete' in qc_feedback.lower():
                        success_factors.append("Complete requirements coverage")
                    
                    # Add attempt-based insights
                    if final_result.get('attempts', 1) == 1:
                        success_factors.append("Succeeded on first attempt")
                    elif final_result.get('attempts', 1) > 1:
                        success_factors.append(f"Improved through {final_result.get('attempts', 1)} iterations")
                    
                    # Add QC score insight
                    qc_score = final_result.get('qc_score', 0)
                    if qc_score >= 95:
                        success_factors.append("Exceptional quality (QC score >= 95)")
                    elif qc_score >= 85:
                        success_factors.append("High quality (QC score >= 85)")
                    else:
                        success_factors.append("Acceptable quality (QC score >= 80)")
                    
                    if not success_factors:
                        success_factors = ["Task completed successfully"]
                    
                    result = await session.run(
                        cypher,
                        task_id=task_id,
                        success_id=f"{task_id}-success-{int(time.time())}",
                        title=f"Success Analysis: QC Score {qc_score}/100",
                        content=f"""
## Success Summary
**QC Score:** {qc_score}/100
**Attempts:** {final_result.get('attempts', 1)}
**Passed On:** Attempt {final_result.get('attempts', 1)}

## QC Feedback
{qc_feedback}

## Key Success Factors
{chr(10).join(f"- {factor}" for factor in success_factors)}

## Lessons Learned
This task demonstrates effective execution patterns that can be applied to similar tasks in the future.
                        """.strip(),
                        qc_score=qc_score,
                        total_attempts=final_result.get('attempts', 1),
                        passed_on_attempt=final_result.get('attempts', 1),
                        success_factors=success_factors,
                        created_at=time.strftime('%Y-%m-%dT%H:%M:%S')
                    )
                    
                    record = await result.single()
                    if record:
                        print(f"✅ Created success analysis: {record['success_id']} with {record['factor_count']} success factors")
            
            return True
        except Exception as e:
            print(f"⚠️ Failed to mark task completed: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
    
    async def _mark_task_failed(self, task_id: str, final_result: dict) -> bool:
        """Mark task as failed with failure details and create failure reason nodes (Phase 9: Task Failure)"""
        try:
            import time
            import json
            from neo4j import AsyncGraphDatabase
            
            uri = "bolt://neo4j_db:7687"
            username = "neo4j"
            password = os.getenv("NEO4J_PASSWORD", "password")
            
            updates = {
                "qcScore": final_result.get('qc_score', 0),
                "qcPassed": False,
                "qcFeedback": final_result.get('qc_feedback', ''),
                "totalAttempts": final_result.get('attempts', 0),
                "totalQCFailures": final_result.get('attempts', 0),
                "improvementNeeded": True,
                "failedAt": time.strftime('%Y-%m-%dT%H:%M:%S'),
                "qcFailureReport": final_result.get('error', '')
            }
            
            # Store QC history if available
            if final_result.get('qc_history'):
                updates["qcAttemptMetrics"] = json.dumps({
                    "history": [{"attempt": i+1, "score": qc['score'], "passed": qc['passed']} 
                                for i, qc in enumerate(final_result['qc_history'])],
                    "lowestScore": min(qc['score'] for qc in final_result['qc_history']),
                    "highestScore": max(qc['score'] for qc in final_result['qc_history']),
                    "avgScore": sum(qc['score'] for qc in final_result['qc_history']) / len(final_result['qc_history'])
                })
            
            # Update task status
            await self._update_task_status(task_id, "failed", updates)
            
            # Create failure analysis node and link it to the failed task
            async with AsyncGraphDatabase.driver(uri, auth=(username, password)) as driver:
                async with driver.session() as session:
                    cypher = """
                    MATCH (t:todo {id: $task_id})
                    CREATE (f:memory {
                        id: $failure_id,
                        type: 'memory',
                        title: $title,
                        content: $content,
                        category: 'failure_analysis',
                        taskId: $task_id,
                        qcScore: $qc_score,
                        totalAttempts: $total_attempts,
                        createdAt: datetime($created_at)
                    })
                    CREATE (t)-[:has_failure_analysis]->(f)
                    
                    // Create suggested fixes as separate memory nodes
                    WITH t, f
                    UNWIND $suggested_fixes as fix
                    CREATE (s:memory {
                        id: $task_id + '-fix-' + toString(id(s)),
                        type: 'memory',
                        title: 'Suggested Fix',
                        content: fix,
                        category: 'suggested_fix',
                        taskId: $task_id,
                        createdAt: datetime($created_at)
                    })
                    CREATE (f)-[:suggests_fix]->(s)
                    
                    RETURN f.id as failure_id, count(s) as fix_count
                    """
                    
                    # Extract suggested fixes from QC feedback
                    suggested_fixes = []
                    if final_result.get('qc_history'):
                        for qc in final_result['qc_history']:
                            if qc.get('required_fixes'):
                                suggested_fixes.extend(qc['required_fixes'])
                    
                    # Deduplicate fixes
                    suggested_fixes = list(set(suggested_fixes))[:5]  # Max 5 fixes
                    
                    if not suggested_fixes:
                        suggested_fixes = ["Review QC feedback and retry with corrections"]
                    
                    result = await session.run(
                        cypher,
                        task_id=task_id,
                        failure_id=f"{task_id}-failure-{int(time.time())}",
                        title=f"Failure Analysis: {final_result.get('error', 'Unknown error')}",
                        content=f"""
## Failure Summary
**Error:** {final_result.get('error', 'Unknown error')}
**QC Score:** {final_result.get('qc_score', 0)}/100
**Total Attempts:** {final_result.get('attempts', 0)}

## QC Feedback
{final_result.get('qc_feedback', 'No feedback available')}

## Recommended Actions
{chr(10).join(f"- {fix}" for fix in suggested_fixes)}
                        """.strip(),
                        qc_score=final_result.get('qc_score', 0),
                        total_attempts=final_result.get('attempts', 0),
                        suggested_fixes=suggested_fixes,
                        created_at=time.strftime('%Y-%m-%dT%H:%M:%S')
                    )
                    
                    record = await result.single()
                    if record:
                        print(f"✅ Created failure analysis: {record['failure_id']} with {record['fix_count']} suggested fixes")
            
            return True
        except Exception as e:
            print(f"⚠️ Failed to mark task failed: {str(e)}")
            import traceback
            traceback.print_exc()
            return False

    async def _call_ecko_with_context(
        self,
        user_request: str,
        relevant_context: str,
        model: str,
        __event_emitter__=None,
    ) -> AsyncGenerator[str, None]:
        """Call Ecko agent to transform user request into structured prompt (with pre-fetched context)"""

        # Construct Ecko's prompt with context
        context_section = ""
        context_references = []
        if relevant_context:
            # Extract document titles from context for reference
            import re

            titles = re.findall(r"\*\*Title:\*\* (.+)", relevant_context)
            context_references = titles

            context_section = f"""
## RELEVANT CONTEXT FROM MEMORY BANK

The following context was retrieved from the MCP memory bank based on semantic similarity to your request:

{relevant_context}

---

**IMPORTANT:** In your structured prompt, include a "## Referenced Documentation" section at the end that lists these {len(titles)} documents that were found to be relevant to this request. This helps the PM agent know what existing knowledge is available.

---

"""

        ecko_prompt = f"""{self.ecko_preamble}

---

## USER REQUEST

<user_request>
{user_request}
</user_request>

{context_section}---

Please analyze this request and generate a comprehensive, structured prompt following the output format specified above.
Output the complete structured prompt as markdown.
Use the model: {model}
"""

        # Yield the output as a code-fenced markdown block
        yield "\n\n## 🎨 Ecko Structured Prompt\n\n"
        yield "```markdown\n"

        # Call copilot-api with selected model
        async for chunk in self._call_llm(ecko_prompt, model):
            yield chunk

        yield "\n```\n\n"
        yield "✅ **Structured prompt ready for PM**\n"

    async def _call_pm(
        self, structured_prompt: str, model: str
    ) -> AsyncGenerator[str, None]:
        """Call PM agent to break down structured prompt into tasks"""

        # Construct PM's prompt
        pm_prompt = f"""{self.pm_preamble}

---

## STRUCTURED PROMPT FROM ECKO

{structured_prompt}

---

Please break this down into a concrete task plan following the output format specified above.
Output the complete plan as markdown that can be reviewed and executed.
Use the model: {model}
"""

        # Yield the output as a code-fenced markdown block
        yield "\n\n## 📋 PM Task Plan\n\n"
        yield "```markdown\n"

        # Call copilot-api with selected model
        async for chunk in self._call_llm(pm_prompt, model):
            yield chunk

        yield "\n```\n\n"
        yield "✅ **Task plan ready for review**\n"

    def _get_max_tokens(self, model: str) -> int:
        """Get maximum tokens for a given model"""
        # Model-specific max output tokens (set to maximum context window - 128k where available)
        model_limits = {
            # GPT-4 family (128k context window)
            "gpt-4": 8192,
            "gpt-4-turbo": 128000,
            "gpt-4.1": 128000,  # 128k context
            "gpt-4o": 128000,   # 128k context
            "gpt-5-mini": 128000,  # 128k context
            # GPT-3.5 family
            "gpt-3.5-turbo": 4096,
            "gpt-3.5-turbo-16k": 16384,
            # Claude family (200k context)
            "claude-3-opus": 200000,
            "claude-3-sonnet": 200000,
            "claude-3-5-sonnet": 200000,
            # Gemini family (1M context)
            "gemini-pro": 32768,
            "gemini-1.5-pro": 1000000,
        }
        
        # Try exact match first
        if model in model_limits:
            return model_limits[model]
        
        # Try partial match
        for key, limit in model_limits.items():
            if model.startswith(key):
                return limit
        
        # Default fallback
        return 128000  # 128k default

    async def _call_llm(self, prompt: str, model: str) -> AsyncGenerator[str, None]:
        """Call copilot-api with streaming"""
        import aiohttp

        url = f"{self.valves.COPILOT_API_URL}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.valves.COPILOT_API_KEY}",
            "Content-Type": "application/json",
        }

        max_tokens = self._get_max_tokens(model)

        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": True,
            "temperature": 0.7,
            "max_tokens": max_tokens,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        yield f"\n\n❌ Error calling {model}: {error_text}\n\n"
                        return

                    async for line in response.content:
                        line = line.decode("utf-8").strip()
                        if line.startswith("data: "):
                            data = line[6:]  # Remove 'data: ' prefix
                            if data == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data)
                                if "choices" in chunk and len(chunk["choices"]) > 0:
                                    delta = chunk["choices"][0].get("delta", {})
                                    content = delta.get("content", "")
                                    if content:
                                        yield content
                            except json.JSONDecodeError:
                                continue

        except Exception as e:
            yield f"\n\n❌ Error: {str(e)}\n\n"

    def _parse_pm_tasks(self, pm_output: str) -> list:
        """Parse tasks from PM output markdown"""
        import re
        
        tasks = []
        
        print(f"🔍 Starting task parsing...")
        print(f"🔍 PM output contains {pm_output.count('**Task ID:**')} occurrences of '**Task ID:**'")
        
        # Split on **Task ID:** markers
        task_sections = re.split(r'\n(?=\s*\*\*Task\s+ID:\*\*)', pm_output, flags=re.IGNORECASE)
        
        print(f"🔍 Split into {len(task_sections)} sections")
        
        for i, section in enumerate(task_sections):
            if not section.strip():
                print(f"🔍 Section {i}: Empty, skipping")
                continue
            
            # Extract task ID
            task_id_match = re.search(r'\*\*Task\s+ID:\*\*\s*(task[-\s]*\d+(?:\.\d+)?)', section, re.IGNORECASE)
            if not task_id_match:
                print(f"🔍 Section {i}: No task ID found, skipping (first 100 chars: {section[:100]})")
                continue
            
            task_id = task_id_match.group(1).replace(' ', '-')
            print(f"🔍 Section {i}: Found task ID: {task_id}")
            
            # Extract fields
            def extract_field(field_name):
                pattern = rf'\*\*{field_name}:\*\*\s*\n?([^\n]+)'
                match = re.search(pattern, section, re.IGNORECASE)
                return match.group(1).strip() if match else None
            
            def extract_multiline_field(field_name):
                pattern = rf'\*\*{field_name}:\*\*\s*\n([\s\S]+?)(?=\n\*\*[A-Za-z][A-Za-z\s]+:\*\*|$)'
                match = re.search(pattern, section, re.IGNORECASE)
                return match.group(1).strip() if match else None
            
            title = extract_field('Title')
            prompt = extract_multiline_field('Prompt')
            dependencies_str = extract_field('Dependencies')
            parallel_group = extract_field('Parallel Group')
            worker_role = extract_field('Agent Role Description')
            qc_role = extract_field('QC Agent Role Description')
            verification_criteria = extract_multiline_field('Verification Criteria')
            
            print(f"🔍   Title: {title}")
            print(f"🔍   Prompt length: {len(prompt) if prompt else 0}")
            print(f"🔍   Dependencies: {dependencies_str}")
            print(f"🔍   Parallel Group: {parallel_group}")
            print(f"🔍   Worker Role: {worker_role[:50] if worker_role else 'N/A'}...")
            print(f"🔍   QC Role: {qc_role[:50] if qc_role else 'N/A'}...")
            
            # Parse dependencies
            dependencies = []
            if dependencies_str and dependencies_str.lower() not in ['none', 'n/a']:
                dependencies = [d.strip() for d in dependencies_str.split(',')]
            
            tasks.append({
                'id': task_id,
                'title': title or f'Task {task_id}',
                'prompt': prompt or '',
                'dependencies': dependencies,
                'parallel_group': int(parallel_group) if parallel_group and parallel_group.isdigit() else None,
                'worker_role': worker_role or 'Worker agent',
                'qc_role': qc_role or 'QC agent',
                'verification_criteria': verification_criteria or 'Verify the output meets all task requirements.',
                'status': 'pending'
            })
        
        print(f"🔍 Parsing complete: {len(tasks)} tasks extracted")
        return tasks
    
    async def _execute_tasks(self, tasks: list, worker_model: str, __event_emitter__=None) -> AsyncGenerator[str, None]:
        """Execute tasks in parallel groups based on dependencies"""
        import asyncio
        
        # Get QC model from valves
        qc_model = self.valves.QC_MODEL
        
        # Build dependency graph and parallel groups
        completed = set()
        remaining = {task['id'] for task in tasks}
        task_map = {task['id']: task for task in tasks}
        
        while remaining:
            # Find tasks ready to execute (all dependencies completed)
            ready = [
                task for task in tasks
                if task['id'] in remaining
                and all(dep in completed for dep in task['dependencies'])
            ]
            
            if not ready:
                yield "\n\n❌ **Error:** Circular dependency or invalid task graph\n\n"
                break
            
            # Group by parallel_group
            groups = {}
            for task in ready:
                group = task['parallel_group'] if task['parallel_group'] is not None else -1
                if group not in groups:
                    groups[group] = []
                groups[group].append(task)
            
            # Execute each group in parallel
            for group_id, group_tasks in groups.items():
                if __event_emitter__:
                    await __event_emitter__({
                        "type": "status",
                        "data": {
                            "description": f"⚙️ Executing {len(group_tasks)} task(s) in parallel...",
                            "done": False
                        }
                    })
                
                # Execute tasks in this group concurrently with QC verification
                results = await asyncio.gather(*[
                    self._execute_with_qc(task, worker_model, qc_model, __event_emitter__)
                    for task in group_tasks
                ])
                
                # Yield results and check for failures
                has_failure = False
                for task, result in zip(group_tasks, results):
                    # Store result status in task for final summary
                    task['result_status'] = result['status']
                    task['result_error'] = result.get('error', '')
                    
                    if result['status'] == 'completed':
                        output_length = len(result['output'])
                        output_lines = result['output'].count('\n')
                        qc_score = result.get('qc_score', 'N/A')
                        attempts = result.get('attempts', 1)
                        
                        yield f"\n\n### ✅ {task['title']}\n\n"
                        yield f"**Task ID:** `{task['id']}`\n\n"
                        yield f"**Status:** {result['status']} ✅\n\n"
                        yield f"**QC Score:** {qc_score}/100\n\n"
                        yield f"**Attempts:** {attempts}\n\n"
                        yield f"**Output:** {output_length} characters, {output_lines} lines\n\n"
                        
                        # Show first 200 chars as preview
                        preview = result['output'][:200].replace('\n', ' ')
                        yield f"**Preview:** {preview}...\n\n"
                        
                        # Show QC feedback if available
                        if result.get('qc_feedback'):
                            qc_preview = result['qc_feedback'][:150].replace('\n', ' ')
                            yield f"**QC Feedback:** {qc_preview}...\n\n"
                    else:
                        has_failure = True
                        qc_score = result.get('qc_score', 'N/A')
                        attempts = result.get('attempts', 1)
                        
                        yield f"\n\n### ❌ {task['title']}\n\n"
                        yield f"**Task ID:** `{task['id']}`\n\n"
                        yield f"**Status:** {result['status']} ❌\n\n"
                        yield f"**QC Score:** {qc_score}/100 (Failed)\n\n"
                        yield f"**Attempts:** {attempts}\n\n"
                        yield f"**Error:** {result['error']}\n\n"
                        
                        # Show QC feedback for failed tasks
                        if result.get('qc_feedback'):
                            yield f"**QC Feedback:** {result['qc_feedback']}\n\n"
                    
                    # Mark as completed (even if failed)
                    completed.add(task['id'])
                    remaining.discard(task['id'])
                
                # CRITICAL: Stop execution if any task failed
                if has_failure:
                    yield "\n\n---\n\n"
                    yield "## ⛔ Orchestration Stopped\n\n"
                    yield "**Reason:** One or more tasks failed. Stopping execution to prevent cascading failures.\n\n"
                    yield "**Failed Tasks:** See above for details.\n\n"
                    yield "**Remaining Tasks:** " + ", ".join([f"`{t['id']}`" for t in tasks if t['id'] in remaining]) + "\n\n"
                    
                    if __event_emitter__:
                        await __event_emitter__({
                            "type": "status",
                            "data": {
                                "description": "⛔ Orchestration stopped due to task failure",
                                "done": True
                            }
                        })
                    return  # Exit early
        
        # Final summary
        yield "\n\n---\n\n"
        yield "## 📊 Execution Summary\n\n"
        
        # Count completed vs failed by checking result status
        completed_count = len([t for t in tasks if t['id'] in completed and t.get('result_status') == 'completed'])
        failed_count = len([t for t in tasks if t['id'] in completed and t.get('result_status') == 'failed'])
        
        yield f"**Total Tasks:** {len(tasks)}\n"
        yield f"**Completed:** {completed_count}\n"
        yield f"**Failed:** {failed_count}\n\n"
        
        if failed_count > 0:
            yield "### ⚠️ Failed Tasks\n\n"
            for task in tasks:
                if task['id'] in completed and task.get('result_status') == 'failed':
                    yield f"- **{task['title']}** (`{task['id']}`): {task.get('result_error', 'Unknown error')}\n"
            yield "\n"
        
        if __event_emitter__:
            await __event_emitter__({
                "type": "status",
                "data": {
                    "description": "✅ All tasks completed",
                    "done": True
                }
            })
    
    async def _execute_single_task(self, task: dict, model: str, __event_emitter__=None) -> dict:
        """Execute a single task"""
        try:
            if __event_emitter__:
                await __event_emitter__({
                    "type": "status",
                    "data": {
                        "description": f"⚙️ Executing: {task['title']}",
                        "done": False
                    }
                })
            
            # Call LLM with task prompt
            output = ""
            async for chunk in self._call_llm(task['prompt'], model):
                output += chunk
            
            return {
                'status': 'completed',
                'output': output,
                'error': None
            }
        except Exception as e:
            return {
                'status': 'failed',
                'output': None,
                'error': str(e)
            }
    
    async def _generate_preamble(self, role_description: str, agent_type: str, task: dict, model: str) -> str:
        """Generate specialized preamble using Agentinator"""
        import hashlib
        
        # Create hash of role description for caching
        role_hash = hashlib.md5(role_description.encode()).hexdigest()[:8]
        preamble_filename = f"{agent_type.lower()}-{role_hash}.md"
        
        print(f"🤖 Generating {agent_type} preamble: {preamble_filename}")
        
        # Load Agentinator preamble
        agentinator_preamble = self._load_agentinator_preamble()
        
        # Load appropriate template
        template_path = f"templates/{agent_type.lower()}-template.md"
        template_content = self._load_template(template_path)
        
        # Construct Agentinator prompt
        agentinator_prompt = f"""{agentinator_preamble}

---

## INPUT

<agent_type>
{agent_type}
</agent_type>

<role_description>
{role_description}
</role_description>

<task_requirements>
{task.get('title', 'Task')}

{task.get('prompt', '')[:500]}
</task_requirements>

<task_context>
Dependencies: {', '.join(task.get('dependencies', []))}
Parallel Group: {task.get('parallel_group', 'N/A')}
</task_context>

<template_path>
{template_path}
</template_path>

---

<template_content>
{template_content}
</template_content>

---

Generate the complete {agent_type} preamble now. Output the preamble directly as markdown (no code fences).
"""
        
        # Generate preamble
        preamble = ""
        async for chunk in self._call_llm(agentinator_prompt, model):
            preamble += chunk
        
        print(f"✅ Generated preamble: {len(preamble)} characters")
        
        return preamble
    
    def _load_agentinator_preamble(self) -> str:
        """Load Agentinator preamble"""
        # Try to load from file
        preamble_paths = [
            "/app/pipelines/../docs/agents/v2/02-agentinator-preamble.md",
            "./docs/agents/v2/02-agentinator-preamble.md",
        ]
        
        for path in preamble_paths:
            try:
                with open(path, "r") as f:
                    return f.read()
            except FileNotFoundError:
                continue
        
        # Fallback: condensed version
        return """# Agentinator (Preamble Generator) v2.0

You generate specialized agent preambles from PM role descriptions.

## Rules:
1. Load correct template (worker-template.md or qc-template.md)
2. Preserve YAML frontmatter and all sections
3. Customize every <TO BE DEFINED> placeholder
4. Add 2-3 task-relevant examples
5. Output raw markdown (no code fences)

Generate the preamble immediately."""
    
    def _load_template(self, template_path: str) -> str:
        """Load worker or QC template"""
        # Try to load from file
        template_paths = [
            f"/app/pipelines/../docs/agents/v2/{template_path}",
            f"./docs/agents/v2/{template_path}",
        ]
        
        for path in template_paths:
            try:
                with open(path, "r") as f:
                    return f.read()
            except FileNotFoundError:
                continue
        
        # Fallback: minimal template
        if "worker" in template_path:
            return """---
description: Worker Agent
tools: ['run_terminal_cmd', 'read_file', 'write', 'search_replace', 'list_dir', 'grep', 'delete_file', 'web_search']
---

# Worker Agent Template

Execute the task autonomously using available tools."""
        else:
            return """---
description: QC Agent
tools: ['run_terminal_cmd', 'read_file', 'grep', 'list_dir']
---

# QC Agent Template

Verify the worker's output meets all requirements."""
    
    async def _execute_with_qc(self, task: dict, worker_model: str, qc_model: str, __event_emitter__=None) -> dict:
        """Execute task with QC verification loop and retry logic"""
        max_retries = 2  # Default from architecture
        attempt_number = 0
        qc_history = []
        
        # Generate preambles (cached by role hash)
        worker_role = task.get('worker_role', 'Worker agent')
        qc_role = task.get('qc_role', 'QC agent')
        
        worker_preamble = await self._generate_preamble(worker_role, 'worker', task, worker_model)
        qc_preamble = await self._generate_preamble(qc_role, 'qc', task, qc_model)
        
        while attempt_number <= max_retries:
            attempt_number += 1
            
            # Phase 2: Worker Execution Start
            await self._update_task_status(task['id'], "worker_executing", {
                "attemptNumber": attempt_number,
                "isRetry": attempt_number > 1
            })
            
            if __event_emitter__:
                await __event_emitter__({
                    "type": "status",
                    "data": {
                        "description": f"⚙️ Worker attempt {attempt_number}/{max_retries + 1}: {task['title']}",
                        "done": False
                    }
                })
            
            # Execute worker
            worker_result = await self._execute_worker(task, worker_preamble, worker_model, attempt_number, qc_history)
            
            if worker_result['status'] == 'failed':
                await self._mark_task_failed(task['id'], {
                    'qc_score': 0,
                    'attempts': attempt_number,
                    'error': worker_result['error']
                })
                return worker_result
            
            # Phase 3: Worker Execution Complete - Store output in graph
            await self._store_worker_output(task['id'], worker_result['output'], attempt_number)
            
            # Phase 5: QC Execution Start
            await self._update_task_status(task['id'], "qc_executing", {
                "qcAttemptNumber": attempt_number
            })
            
            if __event_emitter__:
                await __event_emitter__({
                    "type": "status",
                    "data": {
                        "description": f"🛡️ QC verifying: {task['title']}",
                        "done": False
                    }
                })
            
            qc_result = await self._execute_qc(task, worker_result['output'], qc_preamble, qc_model)
            qc_history.append(qc_result)
            
            # Phase 6: QC Execution Complete - Store result in graph
            await self._store_qc_result(task['id'], qc_result, attempt_number)
            
            # Check QC result
            if qc_result['passed']:
                # Task succeeded - mark as completed in graph (Phase 8: Task Success)
                final_result = {
                    'status': 'completed',
                    'output': worker_result['output'],
                    'qc_score': qc_result['score'],
                    'qc_feedback': qc_result['feedback'],
                    'attempts': attempt_number,
                    'error': None
                }
                
                await self._mark_task_completed(task['id'], final_result)
                
                return final_result
            
            # QC failed - check if we should retry
            if attempt_number > max_retries:
                # Circuit breaker triggered - mark as failed in graph
                final_result = {
                    'status': 'failed',
                    'output': worker_result['output'],
                    'qc_score': qc_result['score'],
                    'qc_feedback': qc_result['feedback'],
                    'qc_history': qc_history,
                    'attempts': attempt_number,
                    'error': f"QC failed after {max_retries + 1} attempts. Score: {qc_result['score']}/100"
                }
                
                # Store failure in graph (Phase 9: Task Failure)
                await self._mark_task_failed(task['id'], final_result)
                
                return final_result
            
            # Prepare for retry
            print(f"🔁 Retry {attempt_number}/{max_retries}: QC score {qc_result['score']}/100")
        
        # Should never reach here
        return {
            'status': 'failed',
            'output': None,
            'error': 'Unexpected error in QC loop'
        }
    
    async def _execute_worker(self, task: dict, preamble: str, model: str, attempt_number: int, qc_history: list) -> dict:
        """Execute worker with preamble and optional retry context"""
        try:
            # Build worker prompt
            worker_prompt = f"""{preamble}

---

## TASK

{task['prompt']}

---

## CONTEXT

- Task ID: {task['id']}
- Attempt: {attempt_number}
- Dependencies: {', '.join(task.get('dependencies', []))}
"""
            
            # Add retry context if this is a retry
            if attempt_number > 1 and qc_history:
                last_qc = qc_history[-1]
                worker_prompt += f"""

## PREVIOUS ATTEMPT FEEDBACK

The previous attempt scored {last_qc['score']}/100 and failed QC.

**Issues:**
{chr(10).join(f"- {issue}" for issue in last_qc.get('issues', []))}

**Required Fixes:**
{chr(10).join(f"- {fix}" for fix in last_qc.get('required_fixes', []))}

**QC Feedback:**
{last_qc['feedback']}

Please address these issues in this attempt.
"""
            
            worker_prompt += "\n\nExecute the task now."
            
            # Execute worker
            output = ""
            async for chunk in self._call_llm(worker_prompt, model):
                output += chunk
            
            return {
                'status': 'completed',
                'output': output,
                'error': None
            }
        except Exception as e:
            return {
                'status': 'failed',
                'output': None,
                'error': str(e)
            }
    
    async def _execute_qc(self, task: dict, worker_output: str, preamble: str, model: str) -> dict:
        """Execute QC verification"""
        try:
            # Build QC prompt
            qc_prompt = f"""{preamble}

---

## TASK REQUIREMENTS

{task['prompt']}

---

## WORKER OUTPUT

{worker_output}

---

## VERIFICATION CRITERIA

{task.get('verification_criteria', 'Verify the output meets all task requirements.')}

---

Verify the worker's output now. Provide:
1. verdict: "PASS" or "FAIL"
2. score: 0-100
3. feedback: 2-3 sentences
4. issues: list of specific problems (if any)
5. requiredFixes: list of what needs to be fixed (if any)

Output as structured markdown.
"""
            
            # Execute QC
            qc_output = ""
            async for chunk in self._call_llm(qc_prompt, model):
                qc_output += chunk
            
            # Parse QC output
            import re
            
            # Try multiple patterns for verdict and score
            # Pattern 1: Inline format (verdict: PASS or Verdict: PASS)
            verdict_match = re.search(r'(?:verdict|Verdict):\s*["\']?(PASS|FAIL)["\']?', qc_output, re.IGNORECASE)
            
            # Pattern 2: Markdown heading format (### 1. Verdict\n**PASS**)
            if not verdict_match:
                verdict_match = re.search(r'###\s*\d+\.\s*Verdict\s*\n\s*\*\*(PASS|FAIL)\*\*', qc_output, re.IGNORECASE)
            
            # Pattern 3: Just **PASS** or **FAIL** after "Verdict"
            if not verdict_match:
                verdict_match = re.search(r'Verdict.*?\*\*(PASS|FAIL)\*\*', qc_output, re.IGNORECASE | re.DOTALL)
            
            # Score patterns
            # Pattern 1: Inline format (score: 100 or Score: 100)
            score_match = re.search(r'(?:score|Score):\s*[*\s]*(\d+)', qc_output, re.IGNORECASE)
            
            # Pattern 2: Markdown heading format (### 2. Score\n**100**)
            if not score_match:
                score_match = re.search(r'###\s*\d+\.\s*Score\s*\n\s*\*\*(\d+)\*\*', qc_output, re.IGNORECASE)
            
            verdict = verdict_match.group(1).upper() if verdict_match else "FAIL"
            score = int(score_match.group(1)) if score_match else 0
            
            print(f"🔍 QC Parsing: verdict={verdict}, score={score}")
            print(f"🔍 QC Output preview: {qc_output[:200]}")
            
            # Extract issues and fixes
            issues = re.findall(r'[-*]\s*(.+)', qc_output)
            
            return {
                'passed': verdict == "PASS" and score >= 80,
                'score': score,
                'feedback': qc_output[:500],  # First 500 chars
                'issues': issues[:5],  # Top 5 issues
                'required_fixes': issues[:5],  # Same as issues for now
                'raw_output': qc_output
            }
        except Exception as e:
            print(f"⚠️ QC execution error: {str(e)}")
            return {
                'passed': False,
                'score': 0,
                'feedback': f"QC execution failed: {str(e)}",
                'issues': [str(e)],
                'required_fixes': ["Fix QC execution error"],
                'raw_output': ""
            }
