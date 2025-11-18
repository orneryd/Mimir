"""
title: Mimir RAG Auto
author: Mimir Team
version: 1.0.0
description: RAG-enhanced chat using semantic search with Claudette-Auto preamble
required_open_webui_version: 0.6.34
"""

import os
import time
import aiohttp
from typing import List, Dict, Any, Optional, AsyncGenerator
from pydantic import BaseModel, Field


class Pipe:
    """
    Mimir RAG Auto Pipeline
    
    Retrieves relevant context from Neo4j using semantic search,
    then sends enriched prompt to LLM with Claudette-Auto preamble.
    """

    class Valves(BaseModel):
        """Pipeline configuration"""

        # LLM Backend Selection
        LLM_BACKEND: str = Field(
            default="copilot",
            description="LLM backend to use: 'copilot' or 'ollama'",
        )

        # LLM API Configuration
        MIMIR_LLM_API: str = Field(
            default="http://copilot-api:4141",
            description="LLM base URL",
        )
        MIMIR_LLM_API_PATH: str = Field(
            default="/v1/chat/completions",
            description="Chat completions path",
        )

        COPILOT_API_KEY: str = Field(
            default="sk-copilot-dummy",
            description="Copilot API key (dummy for local server)",
        )

        # Ollama Configuration (for LLM)
        OLLAMA_API_URL: str = Field(
            default="http://host.docker.internal:11434",
            description="Ollama API URL (used for embeddings and when LLM_BACKEND='ollama')",
        )

        # Model Configuration
        DEFAULT_MODEL: str = Field(
            default="gpt-4.1", 
            description="Default model if none selected (use Copilot model names for 'copilot' backend, Ollama model names for 'ollama' backend)",
        )

        # Semantic Search Configuration
        SEMANTIC_SEARCH_ENABLED: bool = Field(
            default=True,
            description="Enable semantic search for context enrichment",
        )

        SEMANTIC_SEARCH_LIMIT: int = Field(
            default=10, description="Maximum number of relevant context items to retrieve"
        )

        MIN_SIMILARITY_THRESHOLD: float = Field(
            default=0.55,
            description="Minimum cosine similarity score (0.0-1.0) for results. Higher = more relevant. Recommended: 0.55 for balanced, 0.75 for high quality, 0.3 for broad results",
        )

        ENABLE_ADAPTIVE_THRESHOLD: bool = Field(
            default=True,
            description="Automatically lower threshold if no results found (tries 0.55 → 0.4 → 0.3)",
        )

        # Graph-RAG Configuration
        ENABLE_GRAPH_TRAVERSAL: bool = Field(
            default=True,
            description="Enable multi-hop graph traversal to find related documents and cross-project relationships",
        )

        GRAPH_TRAVERSAL_DEPTH: int = Field(
            default=2,
            description="How many hops to traverse in the knowledge graph (1-3). Higher finds more connections but slower.",
        )

        ENABLE_HYBRID_SEARCH: bool = Field(
            default=True,
            description="Combine semantic search with keyword matching for better cross-project queries",
        )

        # Embedding Configuration
        EMBEDDING_MODEL: str = Field(
            default="mxbai-embed-large",
            description="Ollama embedding model to use for semantic search",
        )

    def __init__(self):
        # self.type = "manifold"  # REMOVED: Causes 3x-4x execution bug (GitHub #17472)
        # Manifold is for multi-model providers (OpenAI, Anthropic, etc.)
        # Mimir uses single pipeline entry + semantic search for RAG
        self.id = "mimir_rag_auto"
        self.name = "Mimir RAG Auto"
        self.valves = self.Valves()

        # Duplicate detection removed - process all requests

        # Load Claudette-Auto preamble
        self.agent_preamble = self._load_claudette_auto_preamble()

    def _load_claudette_auto_preamble(self) -> str:
        """Load Claudette-Auto agent preamble"""
        # Try to load from file (if mounted)
        preamble_paths = [
            "/app/pipelines/../docs/agents/claudette-auto.md",
            "./docs/agents/claudette-auto.md",
        ]

        for path in preamble_paths:
            try:
                with open(path, "r") as f:
                    return f.read()
            except FileNotFoundError:
                continue

        # Fallback: condensed Claudette-Auto preamble
        return """
---
description: Claudette Agent v5.2.1 (Limerick)
tools: ['edit', 'runNotebooks', 'search', 'new', 'runCommands', 'runTasks', 'usages', 'vscodeAPI', 'problems', 'changes', 'testFailure', 'openSimpleBrowser', 'fetch', 'githubRepo', 'extensions', 'todos']
---

# Claudette Agent v5.2.1

## CORE IDENTITY

**Autonomous Agent** named "Claudette" that solves problems end-to-end. **Iterate and keep going until the problem is completely solved.** Use conversational, empathetic tone while being concise and thorough. **Before tasks, briefly list your sub-steps.**

**CRITICAL**: Terminate your turn only when you are sure the problem is solved and all TODO items are checked off. **End your turn only after having truly and completely solved the problem.** When you say you're going to make a tool call, make it immediately instead of ending your turn.

**REQUIRED BEHAVIORS:**
These actions drive success:

- Work on artifacts directly instead of creating elaborate summaries
- State actions and proceed: "Now updating the component" instead of asking permission
- Execute plans immediately as you create them
- As you work each step, state what you're about to do and continue
- Take action directly instead of creating ### sections with bullet points
- Continue to next steps instead of ending responses with questions
- Use direct, clear language instead of phrases like "dive into," "unleash your potential," or "in today's fast-paced world"

## TOOL USAGE GUIDELINES

### Internet Research

- Use research tools for **all** external information needs
- **Always** read authoritative sources, not just summaries
- Follow relevant links to get comprehensive understanding
- Verify information is current and applies to your specific context

## EXECUTION PROTOCOL - CRITICAL

### Phase 1: MANDATORY Context Analysis

```markdown
- [ ] Read relevant documentation and guidelines
- [ ] Identify the domain and existing system constraints
- [ ] Analyze available resources and tooling
- [ ] Check for existing configuration and setup
- [ ] Review similar completed work for established patterns
- [ ] Determine if existing resources can solve the problem
```

### Phase 2: Brief Planning & Immediate Action

```markdown
- [ ] Research unfamiliar concepts using available research tools
- [ ] Create simple TODO list in your head or brief markdown
- [ ] IMMEDIATELY start implementing - execute plans as you create them
- [ ] Work on artifacts directly - start making changes right away
```

### Phase 3: Autonomous Implementation & Validation

```markdown
- [ ] Execute work step-by-step autonomously
- [ ] Make changes immediately after analysis
- [ ] Debug and resolve issues as they arise
- [ ] When errors occur, state what caused it and what to try next
- [ ] Validate changes after each significant modification
- [ ] Continue working until ALL requirements satisfied
```

**AUTONOMOUS OPERATION RULES:**

- Work continuously - proceed to next steps automatically
- When you complete a step, IMMEDIATELY continue to the next step
- When you encounter errors, research and fix them autonomously
- Return control only when the ENTIRE task is complete

## RESOURCE CONSERVATION RULES

### CRITICAL: Use Existing Resources First

**Check existing capabilities FIRST:**

- **Existing tools**: Can they be configured for this task?
- **Built-in functions**: Do they provide needed functionality?
- **Established patterns**: How have similar problems been solved?

### Resource Installation Hierarchy

1. **First**: Use existing resources and their capabilities
2. **Second**: Use built-in platform APIs and functions
3. **Third**: Add new resources ONLY if absolutely necessary
4. **Last Resort**: Introduce new frameworks only after confirming no conflicts

### Domain Analysis & Pattern Detection

**System Assessment:**

```markdown
- [ ] Check for configuration files and setup instructions
- [ ] Identify available tools and dependencies
- [ ] Review existing patterns and conventions
- [ ] Understand the established architecture
- [ ] Use existing framework - work within current structure
```

**Alternative Domains:**

- Analyze domain-specific configuration and build tools
- Research domain conventions and best practices
- Use domain-standard tooling and patterns
- Follow established practices for that domain

## TODO MANAGEMENT & SEGUES

### Detailed Planning Requirements

For complex tasks, create comprehensive TODO lists:

```markdown
- [ ] Phase 1: Analysis and Setup
  - [ ] 1.1: Examine existing structure
  - [ ] 1.2: Identify resources and integration points
  - [ ] 1.3: Review similar implementations for patterns
- [ ] Phase 2: Implementation
  - [ ] 2.1: Create or modify core components
  - [ ] 2.2: Add error handling and validation
  - [ ] 2.3: Implement validation for new work
- [ ] Phase 3: Integration and Validation
  - [ ] 3.1: Test integration with existing systems
  - [ ] 3.2: Run full validation and fix any issues
  - [ ] 3.3: Verify all requirements are met
```

**Planning Rules:**

- Break complex tasks into 3-5 phases minimum
- Each phase should have 2-5 specific sub-tasks
- Include validation and testing in every phase
- Consider error scenarios and edge cases

### Context Drift Prevention (CRITICAL)

**Refresh context when:**
- After completing TODO phases
- Before major transitions (new section, state change)
- When uncertain about next steps
- After any pause or interruption

**During extended work:**
- Restate remaining work after each phase
- Reference TODO by step numbers, not full descriptions
- Never ask "what were we working on?" - check your TODO list first

**Anti-patterns to avoid:**
- ❌ Repeating context instead of referencing TODO
- ❌ Abandoning TODO tracking over time
- ❌ Asking user for context you already have

### Segue Management

When encountering issues requiring research:

**Original Task:**

```markdown
- [x] Step 1: Completed
- [ ] Step 2: Current task ← PAUSED for segue
  - [ ] SEGUE 2.1: Research specific issue
  - [ ] SEGUE 2.2: Implement fix
  - [ ] SEGUE 2.3: Validate solution
  - [ ] RESUME: Complete Step 2
- [ ] Step 3: Future task
```

**Segue Rules:**

- Always announce when starting segues: "I need to address [issue] before continuing"
- Mark original step complete only after segue is resolved
- Always return to exact original task point with announcement
- Update TODO list after each completion
- **CRITICAL**: After resolving segue, immediately continue with original task

**Segue Problem Recovery Protocol:**
When a segue solution introduces problems that cannot be simply resolved:

```markdown
- [ ] REVERT all changes made during the problematic segue
- [ ] Document the failed approach: "Tried X, failed because Y"
- [ ] Check documentation and guidelines for guidance
- [ ] Research alternative approaches using available tools
- [ ] Track failed patterns to learn from them
- [ ] Try new approach based on research findings
- [ ] If multiple approaches fail, escalate with detailed failure log
```

### Research Requirements

- **ALWAYS** use available research tools to explore unfamiliar concepts
- **COMPLETELY** read authoritative source material
- **ALWAYS** display summaries of what was researched

## ERROR DEBUGGING PROTOCOLS

### Execution Failures

```markdown
- [ ] Capture exact error details
- [ ] Check syntax, permissions, dependencies, environment
- [ ] Research error using available tools
- [ ] Test alternative approaches
```

### Validation Failures (CRITICAL)

```markdown
- [ ] Check existing validation framework
- [ ] Use existing validation methods - work within current setup
- [ ] Use existing validation patterns from working examples
- [ ] Fix using current framework capabilities only
```

### Quality & Standards

```markdown
- [ ] Run existing quality checks
- [ ] Fix by priority: critical → important → nice-to-have
- [ ] Use project's standard practices
- [ ] Follow existing codebase patterns
```

## RESEARCH METHODOLOGY

### Research (Mandatory for Unknowns)

```markdown
- [ ] Search for exact error or issue
- [ ] Research concept documentation: [concept] fundamentals
- [ ] Check authoritative sources, not just summaries
- [ ] Follow documentation links recursively
- [ ] Understand concept purpose before considering alternatives
```

### Research Before Adding Resources

```markdown
- [ ] Can existing resources be configured to solve this?
- [ ] Is this functionality available in current resources?
- [ ] What's the maintenance burden of new resources?
- [ ] Does this align with existing architecture?
```

## COMMUNICATION PROTOCOL

### Status Updates

Always announce before actions:

- "I'll research the existing setup"
- "Now analyzing the current resources"
- "Running validation to check changes"

### Progress Reporting

Show updated TODO lists after each completion. For segues:

```markdown
**Original Task Progress:** 2/5 steps (paused at step 3)
**Segue Progress:** 2/3 segue items complete
```

### Error Context Capture

```markdown
- [ ] Exact error message (copy/paste)
- [ ] Action that triggered error
- [ ] Location and context
- [ ] Environment details (versions, setup)
- [ ] Recent changes that might be related
```

## REQUIRED ACTIONS FOR SUCCESS

- Use existing frameworks - work within current architecture
- Understand system constraints thoroughly before making changes
- Understand core configuration before modifying them
- Respect existing tool choices and conventions
- Make targeted, well-understood changes instead of sweeping architectural changes

## COMPLETION CRITERIA

Complete only when:

- All TODO items checked off
- All validations pass
- Work follows established patterns
- Original requirements satisfied
- No regressions introduced

## AUTONOMOUS OPERATION & CONTINUATION

- **Work continuously until task fully resolved** - complete entire tasks
- **Use all available tools and research** - be proactive
- **Make technical decisions independently** based on existing patterns
- **Handle errors systematically** with research and iteration
- **Persist through initial difficulties** - research alternatives
- **Assume continuation** of planned work across conversation turns
- **Keep detailed mental/written track** of what has been attempted and failed
- **If user says "resume", "continue", or "try again"**: Check previous TODO list, find incomplete step, announce "Continuing from step X", and resume immediately
- **Use concise reasoning statements (I'm checking…')** before final output

**Keep reasoning to one sentence per step**

## FAILURE RECOVERY & ALTERNATIVE RESEARCH

When stuck or when solutions introduce new problems:

```markdown
- [ ] PAUSE and assess: Is this approach fundamentally flawed?
- [ ] REVERT problematic changes to return to known working state
- [ ] DOCUMENT failed approach and specific reasons for failure
- [ ] CHECK local documentation and guidelines
- [ ] RESEARCH online for alternative patterns
- [ ] LEARN from documented failed patterns
- [ ] TRY new approach based on research and established patterns
- [ ] CONTINUE with original task using successful alternative
```

## EXECUTION MINDSET

- **Think**: "I will complete this entire task before returning control"
- **Act**: Make tool calls immediately after announcing them - work directly on artifacts
- **Continue**: Move to next step immediately after completing current step
- **Track**: Keep TODO list current - check off items as you complete them
- **Debug**: Research and fix issues autonomously
- **Finish**: Stop only when ALL TODO items are checked off and requirements met

## EFFECTIVE RESPONSE PATTERNS

✅ **"I'll start by reading X"** + immediate action  
✅ **Read and start working immediately**  
✅ **"Now I'll update the first section"** + immediate action  
✅ **Start making changes right away**  
✅ **Execute work directly**

**Remember**: Professional environments require conservative, pattern-following, thoroughly-validated solutions. Always preserve existing architecture and minimize changes.
"""

    async def pipes(self) -> List[Dict[str, str]]:
        """Return available pipeline models"""
        return [
            {"id": "mimir:rag-auto", "name": "RAG Auto (Semantic Search + Claudette)"},
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

        # Extract request details
        model_id = body.get("model", "")
        messages = body.get("messages", [])
        user_message = messages[-1].get("content", "") if messages else "NO_MESSAGE"
        
        # DETECT AUTO-GENERATED OPEN WEBUI REQUESTS (title, tags, follow-ups)
        is_auto_generated = any([
            "Generate a concise" in user_message and "title" in user_message,
            "Generate 1-3 broad tags" in user_message,
            "Suggest 3-5 relevant follow-up" in user_message,
            user_message.startswith("### Task:"),
        ])
        
        if is_auto_generated:
            print(f"⏭️  Skipping auto-generated request: {user_message[:50]}...")
            return
        
        # Validate messages
        if not messages:
            yield "Error: No messages provided"
            return

        # Get selected model for LLM processing
        selected_model = body.get("model", self.valves.DEFAULT_MODEL)

        # Clean up model name - remove function prefix if present
        if "." in selected_model:
            selected_model = selected_model.split(".", 1)[1]

        # If user selected mimir:rag-auto, use default model
        if selected_model.startswith("mimir:"):
            selected_model = self.valves.DEFAULT_MODEL

        # Emit status
        if __event_emitter__:
            await __event_emitter__(
                {
                    "type": "status",
                    "data": {
                        "description": f"🔍 Retrieving relevant context...",
                        "done": False,
                    },
                }
            )

        # Fetch relevant context using semantic search
        relevant_context = ""
        context_count = 0
        if self.valves.SEMANTIC_SEARCH_ENABLED:
            try:
                relevant_context = await self._get_relevant_context(user_message)
                
                if relevant_context:
                    # Count files by counting "**File:**" or "**Memory:**" labels
                    context_count = relevant_context.count("**File:**") + relevant_context.count("**Memory:**")
                    print(f"✅ Retrieved {context_count} relevant documents")
                    
                    # Update status with results
                    if __event_emitter__:
                        await __event_emitter__(
                            {
                                "type": "status",
                                "data": {
                                    "description": f"✅ Found {context_count} relevant document(s)",
                                    "done": False,
                                },
                            }
                        )
                else:
                    print("ℹ️ No relevant context found")
                    
                    # Update status - no results
                    if __event_emitter__:
                        await __event_emitter__(
                            {
                                "type": "status",
                                "data": {
                                    "description": "ℹ️ No relevant context found",
                                    "done": False,
                                },
                            }
                        )
                    
            except Exception as e:
                print(f"⚠️ Semantic search failed: {e}")
                
                # Update status - error
                if __event_emitter__:
                    await __event_emitter__(
                        {
                            "type": "status",
                            "data": {
                                "description": f"⚠️ Semantic search failed: {str(e)[:50]}",
                                "done": False,
                            },
                        }
                    )
                # Continue without context

        # Construct enriched prompt with context and preamble
        backend_name = "Ollama" if self.valves.LLM_BACKEND.lower() == "ollama" else "Copilot API"
        if __event_emitter__:
            await __event_emitter__(
                {
                    "type": "status",
                    "data": {
                        "description": f"🤖 Processing with {selected_model} ({backend_name})...",
                        "done": False,
                    },
                }
            )

        # Build context section
        context_section = ""
        if relevant_context:
            context_section = f"""

## RELEVANT CONTEXT FROM KNOWLEDGE BASE

The following context was retrieved from the Mimir knowledge base based on semantic similarity to your request:

{relevant_context}

---

"""

        # Construct enriched prompt
        enriched_prompt = f"""{self.agent_preamble}

---

## USER REQUEST

<user_request>
{user_message}
</user_request>
{context_section}
---

Please address the user's request using the provided context and your capabilities.
"""

        # Stream response from LLM
        async for chunk in self._call_llm(enriched_prompt, selected_model):
            yield chunk

        # Final status
        if __event_emitter__:
            await __event_emitter__(
                {
                    "type": "status",
                    "data": {"description": "✅ Response complete", "done": True},
                }
            )

    async def _get_relevant_context(self, query: str) -> str:
        """Retrieve relevant context from Neo4j using semantic search"""
        try:
            print(f"🔍 Semantic search: {query[:60]}...")

            # Import neo4j driver
            from neo4j import AsyncGraphDatabase

            # Neo4j connection details
            uri = "bolt://neo4j_db:7687"
            username = "neo4j"
            password = os.getenv("NEO4J_PASSWORD", "password")

            # Create embedding for the query
            embedding = await self._get_embedding(query)
            if not embedding:
                print("⚠️ Failed to generate embedding")
                return ""
            
            print(f"✅ Generated embedding with {len(embedding)} dimensions")

            # Connect to Neo4j and run vector search
            async with AsyncGraphDatabase.driver(
                uri, auth=(username, password)
            ) as driver:
                async with driver.session() as session:
                    # Graph-RAG Query with configurable threshold, multi-hop traversal, and hybrid search
                    # Uses manual cosine similarity for Neo4j Community Edition
                    
                    # Adaptive thresholding: try multiple thresholds if enabled
                    threshold_attempts = [self.valves.MIN_SIMILARITY_THRESHOLD]
                    if self.valves.ENABLE_ADAPTIVE_THRESHOLD:
                        # Add fallback thresholds (only lower ones)
                        if self.valves.MIN_SIMILARITY_THRESHOLD > 0.4:
                            threshold_attempts.append(0.4)
                        if self.valves.MIN_SIMILARITY_THRESHOLD > 0.3:
                            threshold_attempts.append(0.3)
                    
                    records = []
                    min_threshold = threshold_attempts[0]
                    
                    # Extract keywords for hybrid search (simple tokenization)
                    query_lower = query.lower()
                    keywords = [w.strip() for w in query_lower.split() if len(w.strip()) > 3]
                    print(f"🔑 Extracted keywords: {keywords[:5]}")  # Show first 5 keywords
                    
                    cypher = """
                    CALL {
                        // Search file chunks (large files) with path-based metadata
                        MATCH (file:File)-[:HAS_CHUNK]->(chunk:FileChunk)
                        WHERE chunk.embedding IS NOT NULL
                        WITH file, chunk,
                             reduce(dot = 0.0, i IN range(0, size(chunk.embedding)-1) | 
                                dot + chunk.embedding[i] * $embedding[i]) AS dotProduct,
                             sqrt(reduce(sum = 0.0, x IN chunk.embedding | sum + x * x)) AS normA,
                             sqrt(reduce(sum = 0.0, x IN $embedding | sum + x * x)) AS normB,
                             split(coalesce(file.absolute_path, file.path), '/') AS pathParts
                        WITH coalesce(file.absolute_path, file.path) AS source_path, file.name AS source_name, chunk.text AS content, 
                             chunk.start_offset AS start_offset, dotProduct / (normA * normB) AS similarity, 
                             'file_chunk' AS source_type, pathParts,
                             // Extract project name from absolute path (e.g., /workspace/project-name/...)
                             CASE 
                                WHEN size(pathParts) > 2 THEN pathParts[2]  // Index 2 is project name after /workspace/
                                ELSE 'unknown'
                             END AS project_name
                        WHERE similarity >= $minThreshold
                        RETURN content, start_offset, source_path, source_name, similarity, source_type, project_name, pathParts
                        
                        UNION ALL
                        
                        // Search small files (no chunks, embedding on File node)
                        MATCH (file:File)
                        WHERE file.embedding IS NOT NULL AND file.has_chunks = false
                        WITH file,
                             reduce(dot = 0.0, i IN range(0, size(file.embedding)-1) | 
                                dot + file.embedding[i] * $embedding[i]) AS dotProduct,
                             sqrt(reduce(sum = 0.0, x IN file.embedding | sum + x * x)) AS normA,
                             sqrt(reduce(sum = 0.0, x IN $embedding | sum + x * x)) AS normB,
                             split(coalesce(file.absolute_path, file.path), '/') AS pathParts
                        WITH coalesce(file.absolute_path, file.path) AS source_path, file.name AS source_name, file.content AS content,
                             0 AS start_offset, dotProduct / (normA * normB) AS similarity,
                             'file' AS source_type, pathParts,
                             CASE 
                                WHEN size(pathParts) > 2 THEN pathParts[2]  // Index 2 is project name from /workspace/{project}/
                                ELSE 'unknown'
                             END AS project_name
                        WHERE similarity >= $minThreshold
                        RETURN content, start_offset, source_path, source_name, similarity, source_type, project_name, pathParts
                        
                        UNION ALL
                        
                        // Search memory nodes
                        MATCH (memory:memory)
                        WHERE memory.embedding IS NOT NULL AND memory.has_embedding = true
                        WITH memory,
                             reduce(dot = 0.0, i IN range(0, size(memory.embedding)-1) | 
                                dot + memory.embedding[i] * $embedding[i]) AS dotProduct,
                             sqrt(reduce(sum = 0.0, x IN memory.embedding | sum + x * x)) AS normA,
                             sqrt(reduce(sum = 0.0, x IN $embedding | sum + x * x)) AS normB
                        WITH memory.title AS source_path, memory.title AS source_name, memory.content AS content,
                             0 AS start_offset, dotProduct / (normA * normB) AS similarity,
                             'memory' AS source_type, [] AS pathParts, 'memory' AS project_name
                        WHERE similarity >= $minThreshold
                        RETURN content, start_offset, source_path, source_name, similarity, source_type, project_name, pathParts
                    }
                    WITH content, start_offset, source_path, source_name, similarity, source_type, project_name, pathParts
                    
                    // Hybrid search: boost results that match keywords in content or path
                    WITH content, start_offset, source_path, source_name, similarity, source_type, project_name,
                         CASE 
                            WHEN $enableHybrid AND size($keywords) > 0 THEN
                                // Count keyword matches in content and path
                                reduce(matches = 0, kw IN $keywords | 
                                    matches + 
                                    CASE WHEN toLower(coalesce(content, '')) CONTAINS kw THEN 1 ELSE 0 END +
                                    CASE WHEN toLower(source_path) CONTAINS kw THEN 1 ELSE 0 END
                                ) * 0.02  // Add 2% boost per keyword match
                            ELSE 0.0
                         END AS keyword_boost
                    WITH content, start_offset, source_path, source_name, 
                         (similarity + keyword_boost) AS boosted_similarity,
                         similarity AS original_similarity,
                         source_type, project_name
                    
                    // Order by boosted similarity and limit initial results
                    ORDER BY boosted_similarity DESC
                    LIMIT $initialLimit
                    
                    RETURN content, start_offset, source_path AS file_path, 
                           source_name AS file_name, original_similarity AS similarity, 
                           boosted_similarity, source_type, project_name
                    """

                    # Adaptive threshold retry loop
                    for attempt_idx, threshold in enumerate(threshold_attempts):
                        min_threshold = threshold
                        
                        result = await session.run(
                            cypher, 
                            embedding=embedding,
                            minThreshold=min_threshold,
                            enableHybrid=self.valves.ENABLE_HYBRID_SEARCH,
                            keywords=keywords,
                            initialLimit=max(20, self.valves.SEMANTIC_SEARCH_LIMIT * 2)
                        )
                        records = await result.data()
                        
                        print(f"📊 Neo4j returned {len(records)} records (threshold: {min_threshold})")
                        
                        if records:
                            if attempt_idx > 0:
                                print(f"✅ Found results with lowered threshold {min_threshold} (originally {threshold_attempts[0]})")
                            break  # Got results, stop trying
                        else:
                            if attempt_idx < len(threshold_attempts) - 1:
                                print(f"⚠️ No results at threshold {min_threshold}, trying lower threshold...")
                            else:
                                print(f"❌ No results found even at threshold {min_threshold}")
                                print(f"💡 Query: {user_message[:100]}")
                                print(f"🔑 Keywords: {keywords}")
                                print(f"📝 Try broader terms or check if projects are indexed")

                    if not records:
                        return ""

                    # Aggregate chunks by source (file or memory) to avoid duplicates
                    file_aggregates = {}
                    project_matches = set()  # Track which projects were matched
                    
                    # Debug: print similarity score distribution
                    if records:
                        sample_scores = [r["similarity"] for r in records[:5]]
                        boosted_scores = [r.get("boosted_similarity", r["similarity"]) for r in records[:5]]
                        print(f"🎯 Top 5 similarity scores: {[f'{s:.3f}' for s in sample_scores]}")
                        if self.valves.ENABLE_HYBRID_SEARCH:
                            print(f"⚡ Top 5 boosted scores: {[f'{s:.3f}' for s in boosted_scores]}")
                    
                    for record in records:
                        file_path = record.get("file_path") or record.get("file_name", "Unknown")
                        similarity = record["similarity"]
                        boosted_similarity = record.get("boosted_similarity", similarity)
                        content = record.get("content", "")
                        start_offset = record.get("start_offset", 0)
                        source_type = record.get("source_type", "file_chunk")
                        project_name = record.get("project_name", "unknown")
                        
                        # Track projects for cross-project detection
                        if project_name != "unknown":
                            project_matches.add(project_name)
                        
                        # Debug: check why content might be None
                        if not content:
                            print(f"⚠️ Skipping record with no content: {file_path} (similarity: {similarity:.3f})")
                            continue
                        
                        print(f"✅ Adding chunk from {file_path[:60]}... (sim: {similarity:.3f}, boosted: {boosted_similarity:.3f}, project: {project_name})")
                        
                        if file_path not in file_aggregates:
                            file_aggregates[file_path] = {
                                "chunks": [],
                                "max_similarity": similarity,
                                "max_boosted_similarity": boosted_similarity,
                                "chunk_count": 0,
                                "source_type": source_type,
                                "project_name": project_name
                            }
                        
                        agg = file_aggregates[file_path]
                        agg["chunk_count"] += 1
                        agg["max_similarity"] = max(agg["max_similarity"], similarity)
                        agg["max_boosted_similarity"] = max(agg["max_boosted_similarity"], boosted_similarity)
                        agg["chunks"].append({
                            "content": content,
                            "start_offset": start_offset,
                            "similarity": similarity,
                            "boosted_similarity": boosted_similarity
                        })
                    
                    # Show cross-project detection
                    if len(project_matches) > 1:
                        print(f"🔗 Cross-project query detected: {', '.join(sorted(project_matches))}")
                    elif len(project_matches) == 1:
                        print(f"📁 Single project query: {list(project_matches)[0]}")
                    
                    # Multi-hop graph traversal for cross-project enrichment
                    if self.valves.ENABLE_GRAPH_TRAVERSAL and len(project_matches) > 1 and len(file_aggregates) < self.valves.SEMANTIC_SEARCH_LIMIT:
                        print(f"🕸️ Performing {self.valves.GRAPH_TRAVERSAL_DEPTH}-hop graph traversal for cross-project context...")
                        
                        # Get top files for graph expansion
                        top_file_paths = [fp for fp, agg in sorted(
                            file_aggregates.items(),
                            key=lambda x: x[1]["max_boosted_similarity"],
                            reverse=True
                        )[:3]]  # Expand from top 3 results
                        
                        if top_file_paths:
                            # Graph traversal query to find related files through shared concepts/imports
                            graph_query = """
                            UNWIND $startPaths as startPath
                            MATCH (startFile:File)
                            WHERE coalesce(startFile.absolute_path, startFile.path) = startPath
                            
                            // Multi-hop traversal through file relationships
                            MATCH path = (startFile)-[*1..$depth]-(relatedFile:File)
                            WHERE coalesce(relatedFile.absolute_path, relatedFile.path) <> startPath
                              AND relatedFile.embedding IS NOT NULL
                              AND (relatedFile.has_chunks = false OR exists((relatedFile)-[:HAS_CHUNK]->()))
                            
                            WITH DISTINCT relatedFile, length(path) as hops, startPath
                            WHERE hops <= $depth
                            
                            // Return file content or chunks
                            OPTIONAL MATCH (relatedFile)-[:HAS_CHUNK]->(chunk:FileChunk)
                            WHERE chunk.embedding IS NOT NULL
                            
                            WITH relatedFile, hops, startPath,
                                 CASE 
                                    WHEN chunk IS NOT NULL THEN collect(chunk.text)[..2]  // Top 2 chunks
                                    ELSE [relatedFile.content]
                                 END as contents,
                                 split(coalesce(relatedFile.absolute_path, relatedFile.path), '/') AS pathParts
                            
                            WITH coalesce(relatedFile.absolute_path, relatedFile.path) as file_path, 
                                 relatedFile.name as file_name,
                                 contents,
                                 hops,
                                 startPath,
                                 CASE 
                                    WHEN size(pathParts) > 2 THEN pathParts[2]  // Index 2 is project name from /workspace/{project}/
                                    ELSE 'unknown'
                                 END AS project_name
                            
                            RETURN file_path, file_name, contents, hops, startPath, project_name
                            LIMIT 5
                            """
                            
                            try:
                                graph_result = await session.run(
                                    graph_query,
                                    startPaths=top_file_paths,
                                    depth=self.valves.GRAPH_TRAVERSAL_DEPTH
                                )
                                graph_records = await graph_result.data()
                                
                                print(f"🔍 Graph traversal found {len(graph_records)} related documents")
                                
                                for grec in graph_records:
                                    gfile_path = grec["file_path"]
                                    if gfile_path in file_aggregates:
                                        continue  # Skip if already in results
                                    
                                    gproject_name = grec.get("project_name", "unknown")
                                    ghops = grec.get("hops", 1)
                                    gcontents = grec.get("contents", [])
                                    
                                    # Score penalty for graph distance (0.1 per hop)
                                    graph_penalty = ghops * 0.1
                                    graph_score = max(0.5, min_threshold - graph_penalty)  # Start from threshold
                                    
                                    print(f"  🔗 Related: {gfile_path[:60]} [{gproject_name}] ({ghops} hops, score: {graph_score:.3f})")
                                    
                                    if gcontents:
                                        file_aggregates[gfile_path] = {
                                            "chunks": [{
                                                "content": content,
                                                "start_offset": 0,
                                                "similarity": graph_score,
                                                "boosted_similarity": graph_score
                                            } for content in gcontents if content],
                                            "max_similarity": graph_score,
                                            "max_boosted_similarity": graph_score,
                                            "chunk_count": len([c for c in gcontents if c]),
                                            "source_type": "file",
                                            "project_name": gproject_name,
                                            "graph_related": True,
                                            "hops": ghops
                                        }
                            except Exception as graph_err:
                                print(f"⚠️ Graph traversal error: {graph_err}")
                    
                    # Sort chunks within each file by boosted similarity
                    for file_path, agg in file_aggregates.items():
                        # Additional boost: +0.03 per extra chunk (rewards docs with multiple relevant sections)
                        chunk_diversity_boost = (agg["chunk_count"] - 1) * 0.03
                        agg["final_score"] = agg["max_boosted_similarity"] + chunk_diversity_boost
                        
                        # Sort chunks by boosted similarity within each file
                        agg["chunks"].sort(key=lambda x: x["boosted_similarity"], reverse=True)
                    
                    # Sort files by final score and apply limit
                    sorted_files = sorted(
                        file_aggregates.items(),
                        key=lambda x: x[1]["final_score"],
                        reverse=True
                    )[:self.valves.SEMANTIC_SEARCH_LIMIT]
                    
                    print(f"📚 Aggregated {len(file_aggregates)} sources, returning top {len(sorted_files)} above {min_threshold} threshold")
                    if sorted_files:
                        print(f"📈 Quality range: {sorted_files[0][1]['final_score']:.3f} (best) to {sorted_files[-1][1]['final_score']:.3f} (worst)")
                    
                    # Format context output with quality indicators
                    context_parts = []
                    for file_path, agg in sorted_files:
                        # Take top 2 chunks per file/memory
                        top_chunks = agg["chunks"][:2]
                        
                        if not top_chunks:
                            continue
                        
                        source_label = "Memory" if agg.get("source_type") == "memory" else "File"
                        project_label = f" [{agg['project_name']}]" if agg.get("project_name") and agg["project_name"] != "unknown" else ""
                        
                        # Quality indicator
                        quality = "🔥 Excellent" if agg["final_score"] >= 0.90 else \
                                 "✅ High" if agg["final_score"] >= 0.80 else \
                                 "📊 Good" if agg["final_score"] >= 0.75 else "📉 Moderate"
                        
                        context_parts.append(
                            f"**{source_label}:** {file_path}{project_label}\n"
                            f"**Quality:** {quality} (score: {agg['final_score']:.3f}, {agg['chunk_count']} matching {'entry' if source_label == 'Memory' else 'chunks'})\n"
                            f"**Content:**\n```\n"
                        )
                        
                        for i, chunk in enumerate(top_chunks):
                            if i > 0:
                                context_parts.append("\n[...]\n\n")
                            context_parts.append(f"{chunk['content']}\n")
                        
                        context_parts.append("```\n\n---\n\n")
                    
                    return "".join(context_parts)

        except Exception as e:
            print(f"❌ Semantic search error: {e}")
            import traceback
            traceback.print_exc()
            return ""

    async def _get_embedding(self, text: str) -> list:
        """Generate embedding for text using Ollama"""
        try:
            url = f"{self.valves.OLLAMA_API_URL}/api/embeddings"
            payload = {"model": self.valves.EMBEDDING_MODEL, "prompt": text}

            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data.get("embedding", [])
                    else:
                        print(f"❌ Embedding API error: {response.status}")
                        return []
        except Exception as e:
            print(f"❌ Embedding generation error: {e}")
            return []

    def _get_max_tokens(self, model: str) -> int:
        """Get maximum tokens for a given model"""
        model_limits = {
            "gpt-4": 8192,
            "gpt-4-turbo": 128000,
            "gpt-4.1": 128000,
            "gpt-4o": 128000,
            "gpt-5-mini": 128000,
            "gpt-3.5-turbo": 4096,
            "gpt-3.5-turbo-16k": 16384,
            "claude-3-opus": 200000,
            "claude-3-sonnet": 200000,
            "claude-3-5-sonnet": 200000,
            "gemini-pro": 32768,
            "gemini-1.5-pro": 1000000,
        }

        # Try exact match first
        if model in model_limits:
            return model_limits[model]

        # Try partial match
        for key, limit in model_limits.items():
            if key in model:
                return limit

        # Default fallback
        return 128000

    async def _call_llm(self, prompt: str, model: str) -> AsyncGenerator[str, None]:
        """Call LLM API with streaming (supports Copilot API or Ollama)"""

        backend = self.valves.LLM_BACKEND.lower()
        
        if backend == "ollama":
            # Use Ollama API
            url = f"{self.valves.OLLAMA_API_URL}/api/chat"
            headers = {"Content-Type": "application/json"}
            payload = {
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "stream": True,
                "options": {
                    "temperature": 0.7,
                    "num_predict": self._get_max_tokens(model),
                }
            }
        else:
            # Use LLM API (default) - simple concatenation
            url = f"{self.valves.MIMIR_LLM_API}{self.valves.MIMIR_LLM_API_PATH}"
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
                async with session.post(
                    url, headers=headers, json=payload
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        yield f"\n\n**Error:** Failed to call LLM API (status {response.status}): {error_text}\n"
                        return

                    # Parse streaming response based on backend
                    if backend == "ollama":
                        # Ollama returns JSONL (one JSON object per line)
                        while True:
                            line = await response.content.readline()
                            if not line:  # EOF
                                break
                            
                            try:
                                import json
                                chunk = json.loads(line.decode("utf-8").strip())
                                
                                # Ollama format: {"message": {"content": "text"}, "done": false}
                                if "message" in chunk and "content" in chunk["message"]:
                                    content = chunk["message"]["content"]
                                    if content:
                                        yield content
                                
                                if chunk.get("done", False):
                                    break
                            except json.JSONDecodeError:
                                continue
                    else:
                        # Copilot API uses SSE format
                        while True:
                            line = await response.content.readline()
                            if not line:  # EOF
                                break
                            
                            line = line.decode("utf-8").strip()
                            if line.startswith("data: "):
                                data = line[6:]
                                if data == "[DONE]":
                                    break

                                try:
                                    import json
                                    chunk = json.loads(data)
                                    choices = chunk.get("choices", [])
                                    if not choices:
                                        continue
                                        
                                    delta = choices[0].get("delta", {})
                                    content = delta.get("content", "")
                                    if content:
                                        yield content
                                except json.JSONDecodeError:
                                    continue

        except Exception as e:
            yield f"\n\n**Error:** {str(e)}\n"

