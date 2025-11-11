# Project Loki Implementation via Mimir: Oscillatory Adversarial Architecture

**Document Type:** Architecture Extension  
**Parent Document:** Mimir-Loki.md (GIST)  
**Date:** November 10, 2025  
**Status:** Design Proposal

---

## New Section: How We'll Use Mimir to Implement Brain-Inspired Adversarial Learning

### Background: Research Findings

Based on comprehensive research into brain oscillations and adversarial neural networks (see `docs/research/BRAIN_OSCILLATIONS_ADVERSARIAL_NETWORKS_RESEARCH.md`), we discovered that:

1. **Brain oscillations involve bidirectional information flow:**
   - Gamma oscillations (30-150 Hz): Feedforward, bottom-up processing
   - Beta oscillations (13-30 Hz): Feedback, top-down processing
   - Creates natural "forward/backward pass" structure

2. **Cortical interneurons can act as adversarial discriminators:**
   - Research by Benjamin & Kording (2023) shows interneurons discriminate between stimulus-evoked (wake) and self-generated (sleep) activity
   - Use phase-dependent plasticity: Hebbian during wake, anti-Hebbian during sleep
   - Provides teaching signal similar to GAN discriminators

3. **Multi-timescale oscillatory organization enables hierarchical processing:**
   - Fast oscillations (gamma) for local processing
   - Slow oscillations (beta, theta) for long-distance coordination
   - Cross-frequency coupling coordinates hierarchical representations

**Key Insight:** We can map this biological architecture directly to Project Loki's multi-sensory integration system using Mimir's multi-agent orchestration capabilities.

---

## Enhanced Architecture: Oscillatory Adversarial Project Loki (OA-Loki)

### Core Enhancement: Add Local Discriminators per Sensory Modality

**Original Loki:**
```
External Stimuli → Sensory Workers (5) → Loki Integration → Neo4j Memory
```

**OA-Loki (Enhanced):**
```
External Stimuli → Sensory Workers (5 generators)
                         ↓
                   Local Discriminators (5 interneuron analogs)
                         ↓
                   Loki Integration (generator + predictor)
                         ↓
                   Global Discriminator (coherence assessor)
                         ↓
                   Neo4j Memory (+ adversarial training history)
```

---

### Agent Composition (12 Total Agents)

#### **Sensory Layer (10 agents - parallelizable via Mimir orchestration):**

**5 Sensory Worker Agents (Generators):**
1. **Vision Worker** - Processes visual input, generates representations
2. **Audio Worker** - Processes auditory input, generates representations
3. **Tactile Worker** - Processes haptic input, generates representations
4. **Olfactory Worker** - Processes olfactory input, generates representations
5. **Gustatory Worker** - Processes gustatory input, generates representations

**Role:** Process sensory input and generate embeddings (analogous to pyramidal cells)

**Mimir Tools Used:**
- `memory_node(operation='add')` - Store sensory representations in Neo4j
- `memory_edge(operation='add')` - Link representations to episodes
- `vector_search_nodes()` - Find similar past experiences

---

**5 Local Discriminator Agents (Interneuron Analogs):**
1. **Vision Discriminator** - Distinguishes real vs. predicted visual input
2. **Audio Discriminator** - Distinguishes real vs. predicted audio input
3. **Tactile Discriminator** - Distinguishes real vs. predicted tactile input
4. **Olfactory Discriminator** - Distinguishes real vs. predicted olfactory input
5. **Gustatory Discriminator** - Distinguishes real vs. predicted gustatory input

**Role:** Adversarially evaluate sensory workers (analogous to cortical interneurons)

**Mechanism:**
- **Wake Phase:** Train to recognize REAL sensory input (from external stimuli)
  * Hebbian-like plasticity: Strengthen connections when correct
  * Maximize discriminator output on real data: $D(x_{real}) → 1$
- **Sleep Phase:** Train to detect GENERATED input (from Loki's predictions)
  * Anti-Hebbian-like plasticity: Weaken connections when generated
  * Minimize discriminator output on generated data: $D(x_{generated}) → 0$

**Mimir Tools Used:**
- `memory_node(operation='query')` - Retrieve past classifications
- `memory_edge(operation='get')` - Get relationship to sensory representations
- `memory_lock(operation='acquire')` - Prevent race conditions in multi-agent orchestration

---

#### **Integration Layer (2 agents - sequential):**

**Loki Integration Agent (Generator + Predictor):**

**Enhanced Capabilities:**
1. **Cross-Modal Integration** (original function)
   - Combine all 5 sensory representations
   - Create unified multi-sensory representation
   - Store in Neo4j with cross-modal edges

2. **Cross-Modal Prediction** (NEW - adversarial component)
   - Generate expected sensory input in one modality based on others
   - Example: Given audio (footsteps), predict visual (person walking)
   - Predictions sent to local discriminators for evaluation

3. **Adversarial Refinement** (NEW)
   - Receive feedback from 5 local discriminators
   - Improve predictions to "fool" discriminators
   - Analogous to GAN generator training

**Mimir Tools Used:**
- `memory_node(operation='query')` - Retrieve episodic memories for context
- `memory_edge(operation='subgraph')` - Traverse cross-modal associations
- `vector_search_nodes()` - Find semantically similar multi-sensory episodes
- `get_task_context()` - Get filtered context for prediction task

---

**Global Discriminator Agent (Coherence Assessor):**

**Role:** Assess whether multi-sensory integration is coherent (NEW component)

**Function:**
- Evaluate integrated representation from Loki
- Detect conflicts between sensory modalities
- Compare current experience with episodic memory
- Provide global feedback: P(coherent) ∈ [0, 1]

**Example Conflict Detection:**
- Vision: Sees person talking
- Audio: Hears silence
- Global Discriminator: Detects incoherence → flags conflict

**Mimir Tools Used:**
- `memory_node(operation='query')` - Query past coherent episodes
- `memory_edge(operation='neighbors')` - Find related experiences
- `vector_search_nodes()` - Semantic search for similar scenarios

---

### Multi-Timescale Orchestration (Inspired by Cortical Oscillations)

Mimir's multi-agent orchestration enables hierarchical timescales:

#### **Fast Timescale: Within-Modality Discrimination (~100ms analog)**

**Process:**
```python
# Per sensory input (real-time processing)
for modality in [vision, audio, tactile, olfactory, gustatory]:
    representation = sensory_worker[modality].process(input)
    classification = local_discriminator[modality].classify(representation)
    if classification < threshold:
        representation = sensory_worker[modality].refine(feedback)
```

**Mimir Implementation:**
- Single round-trip per modality
- Uses `memory_lock()` to prevent race conditions
- Fast: ~1-2 seconds per modality

**Biological Analog:** Gamma oscillations (30-150 Hz, local circuit processing)

---

#### **Medium Timescale: Cross-Modal Integration (~500ms analog)**

**Process:**
```python
# Per multi-sensory event (when multiple modalities active)
all_representations = [worker.representation for worker in sensory_workers]
integrated_rep = loki_agent.integrate(all_representations)
predictions = loki_agent.predict_cross_modal(integrated_rep)

# Evaluate predictions
feedback = []
for modality, prediction in predictions.items():
    score = local_discriminator[modality].classify(prediction)
    feedback.append((modality, score))

# Refine based on feedback
integrated_rep = loki_agent.refine(integrated_rep, feedback)

# Global coherence check
coherence = global_discriminator.assess(integrated_rep, all_representations)
```

**Mimir Implementation:**
- Multi-agent orchestration: Workers → Loki → Discriminators → Global
- Uses `memory_edge()` to link cross-modal representations
- Medium speed: ~5-7 seconds per integrated event

**Biological Analog:** Beta oscillations (13-30 Hz, long-distance feedback)

---

#### **Slow Timescale: Wake/Sleep Phase Switching (~2-5 second analog)**

**Process:**
```python
# Periodic phase switching during operation
if event_count % WAKE_PHASE_LENGTH == 0:
    system_phase = "sleep"  # Switch to sleep
    acetylcholine_analog = 0  # Neuromodulator signal
else:
    system_phase = "wake"
    acetylcholine_analog = 1

# Store in Neo4j for all agents to query
memory_node(operation='update', 
           id='system_state',
           properties={'phase': system_phase, 'ach': acetylcholine_analog})

# All agents check phase before processing
for agent in all_agents:
    phase = memory_node(operation='get', id='system_state').properties['phase']
    if phase == 'wake':
        agent.plasticity_rule = 'hebbian'
    else:
        agent.plasticity_rule = 'anti_hebbian'
```

**Mimir Implementation:**
- Background process updates global state in Neo4j
- All agents query `system_state` node before processing
- Automatic plasticity rule switching

**Biological Analog:** Theta oscillations (4-8 Hz, cross-region coordination)

---

#### **Very Slow Timescale: Consolidation/Replay (~hours analog)**

**Process:**
```python
# Periodic offline processing (e.g., nightly batch job)
episodes = memory_node(operation='query', 
                       type='episode',
                       filters={'importance': 'high', 'replayed': False})

for episode in episodes:
    # Replay through full system
    representations = [worker.recall(episode) for worker in sensory_workers]
    integrated = loki_agent.integrate(representations)
    coherence = global_discriminator.assess(integrated, representations)
    
    # Strengthen coherent, prune incoherent
    if coherence > threshold:
        memory_edge(operation='add', 
                   source=episode.id, 
                   target='consolidated_memory',
                   type='strengthened',
                   properties={'coherence': coherence})
    else:
        memory_node(operation='update',
                   id=episode.id,
                   properties={'flagged_for_review': True})
```

**Mimir Implementation:**
- Scheduled batch process (cron job)
- Queries Neo4j for important episodes
- Re-processes through all agents
- Updates graph with consolidation metadata

**Biological Analog:** Sleep consolidation (hours, memory strengthening)

---

### Information Flow Patterns

#### **Forward Pass (Bottom-Up, "Gamma-like"):**

```
External Stimuli (5 parallel inputs)
    ↓
Sensory Workers (5 parallel LLM agents - process simultaneously)
    ↓
Representations (5 embeddings stored in Neo4j)
    ↓
Loki Integration (1 LLM agent - combines all)
    ↓
Integrated Multi-Sensory Representation (stored in Neo4j)
```

**Mimir Tools:**
- `memory_node(operation='add')` - Store each representation
- `memory_edge(operation='add', type='contains')` - Link representations to integrated rep

**Characteristics:**
- Parallel processing across modalities (Mimir orchestrates)
- Fast, real-time
- Data-driven
- Analogous to gamma oscillations (local, feedforward)

---

#### **Backward Pass (Top-Down, "Beta-like"):**

```
Episodic Memory (Neo4j query via Mimir)
    ↓
Loki Predictions (generate expected sensory input per modality)
    ↓
Top-Down Signals (5 parallel predictions sent to discriminators)
    ↓
Local Discriminators (5 parallel LLM agents - evaluate predictions)
    ↓
Feedback Gradients (error signals)
    ↓
Sensory Worker Updates (refine representations based on feedback)
```

**Mimir Tools:**
- `memory_node(operation='query')` - Retrieve episodic context
- `memory_edge(operation='subgraph')` - Traverse cross-modal associations
- `vector_search_nodes()` - Find similar past experiences

**Characteristics:**
- Sequential: Loki → Discriminators → Workers
- Slower, predictive
- Model-driven
- Analogous to beta oscillations (long-distance, feedback)

---

#### **Oscillatory Pass (Bidirectional Comparison):**

```
CYCLE 1 (Wake Phase - Real Data):
External Input → Sensory Worker → Local Discriminator
                                      ↓
                                   "This is REAL" (score → 1)
                                      ↓
                                   Store in Neo4j with label 'real'

CYCLE 2 (Sleep Phase - Generated Data):
Loki Prediction → Sensory Worker → Local Discriminator
                                      ↓
                                   "This is GENERATED" (score → 0)
                                      ↓
                                   Store in Neo4j with label 'generated'

COMPARISON (Oscillatory Algorithm):
Discriminator compares both within single cycle:
- Wake distribution: q_φ(x|external_input)
- Sleep distribution: p_θ(x|loki_prediction)
- Gradient: ∇[E_wake[D] - E_sleep[D]]
- Send gradients to both worker and Loki
```

**Mimir Tools:**
- `memory_node(operation='update')` - Update representations with gradients
- `memory_lock(operation='acquire')` - Prevent race conditions during update

**Characteristics:**
- Rapid alternation between bottom-up and top-down
- Within-phase comparison (single discrimination cycle)
- Enables local credit assignment
- Analogous to cortical oscillatory algorithm (Benjamin & Kording 2023)

---

### Mimir-Specific Implementation Details

#### **Multi-Agent Locking for Concurrency Control:**

**Problem:** 10 agents (5 workers + 5 discriminators) running in parallel could create race conditions

**Solution:** Use Mimir's `memory_lock` tool

```python
# Worker agent attempts to process sensory input
lock_result = memory_lock(operation='acquire',
                         node_id='sensory_input_123',
                         agent_id='vision_worker',
                         timeout_ms=5000)

if lock_result.locked:
    # Process input
    representation = process_visual_input(input)
    memory_node(operation='add', 
               type='sensory_representation',
               properties={'modality': 'vision', 'embedding': representation})
    
    # Release lock
    memory_lock(operation='release',
               node_id='sensory_input_123',
               agent_id='vision_worker')
else:
    # Another worker is processing this input - skip or retry
    pass
```

**Benefits:**
- Prevents duplicate processing
- Ensures atomic operations
- Enables true parallel execution

---

#### **Context Isolation for Worker Agents:**

**Problem:** Worker agents don't need full Loki context (90%+ token waste)

**Solution:** Use Mimir's `get_task_context` tool

```python
# Worker agent (focused context):
context = get_task_context(task_id='process_visual_input_123',
                          agent_type='worker')
# Returns: input data, modality type, discriminator feedback (< 10% of full context)

# Loki agent (full context):
context = get_task_context(task_id='integrate_multimodal_123',
                          agent_type='pm')
# Returns: all sensory representations, episodic memories, discriminator scores (100% context)
```

**Benefits:**
- 90%+ token reduction for workers
- Faster processing (less context to parse)
- Lower cost (fewer tokens)

---

#### **Neo4j Graph Schema for Adversarial Training:**

**New Node Types:**
```cypher
// Sensory Representation (from workers)
(:SensoryRepresentation {
  modality: 'vision',
  embedding: [...],
  confidence: 0.85,
  phase: 'wake',
  timestamp: ...
})

// Discriminator Score (from discriminators)
(:DiscriminatorScore {
  modality: 'vision',
  score: 0.92,  // P(real)
  phase: 'wake',
  feedback_gradient: [...],
  timestamp: ...
})

// Integrated Representation (from Loki)
(:IntegratedRepresentation {
  embeddings: {...},  // All 5 modalities
  coherence: 0.88,
  timestamp: ...
})

// System State (for phase switching)
(:SystemState {
  phase: 'wake',
  acetylcholine_analog: 1,
  cycle_count: 42,
  timestamp: ...
})
```

**New Relationship Types:**
```cypher
// Worker → Discriminator evaluation
(:SensoryRepresentation)-[:EVALUATED_BY {score: 0.92}]->(:DiscriminatorScore)

// Loki → Workers prediction
(:IntegratedRepresentation)-[:PREDICTS {modality: 'vision'}]->(:SensoryRepresentation)

// Episode → Representations
(:Episode)-[:CONTAINS {modality: 'vision'}]->(:SensoryRepresentation)
(:Episode)-[:HAS_INTEGRATION]->(:IntegratedRepresentation)

// Adversarial training history
(:DiscriminatorScore)-[:FEEDBACK_TO]->(:SensoryRepresentation)
```

**Query Examples:**
```cypher
// Get discriminator performance over time
MATCH (d:DiscriminatorScore {modality: 'vision'})
WHERE d.timestamp > datetime() - duration('P7D')
RETURN avg(d.score) as avg_accuracy

// Find episodes with high coherence
MATCH (e:Episode)-[:HAS_INTEGRATION]->(i:IntegratedRepresentation)
WHERE i.coherence > 0.85
RETURN e, i
ORDER BY i.coherence DESC
LIMIT 10

// Track wake/sleep phase distribution alignment
MATCH (sr:SensoryRepresentation {modality: 'vision', phase: 'wake'})
WITH collect(sr.embedding) as wake_embeddings
MATCH (sr2:SensoryRepresentation {modality: 'vision', phase: 'sleep'})
WITH wake_embeddings, collect(sr2.embedding) as sleep_embeddings
RETURN cosineSimilarity(avg(wake_embeddings), avg(sleep_embeddings)) as distribution_alignment
```

---

### Computational Requirements Summary

**Agent Count:** 12 total
- 5 Sensory Workers (parallel)
- 5 Local Discriminators (parallel)
- 1 Loki Integration Agent (sequential)
- 1 Global Discriminator (sequential)

**Concurrency:** Up to 10 agents in parallel (5 workers + 5 discriminators)

**Tokens per Event:** ~7,100 tokens
- Workers: 5 × 500 = 2,500 tokens
- Discriminators: 5 × 400 = 2,000 tokens
- Loki: 1 × 1,500 = 1,500 tokens
- Global Disc: 1 × 1,100 = 1,100 tokens

**Latency per Event:** 6.5-10 seconds (hardware dependent)

**Throughput:** 5-15 events/minute (hardware dependent)

**Hardware Options:**
1. **Single RTX 4090:** $3K, 12-15 events/min, good for development
2. **4× RTX 4090:** $12.5K, 10-11 events/min, recommended for production
3. **Cloud API (Together.ai):** $0.003/event, 10-15 events/min, zero upfront cost
4. **Hybrid Local + Cloud:** $4K + $250/month, 8-10 events/min, best quality/cost ratio

**Recommended Starting Configuration:** Cloud API (Together.ai) for prototyping → Hybrid for production

---

### Implementation Phases (8-Week Timeline)

**Phase 1: Basic Adversarial (Weeks 1-2)**
- Implement vision worker + vision discriminator
- Wake/sleep phase switching in Neo4j
- Basic oscillatory training loop
- Success: Discriminator accuracy > 80%

**Phase 2: Multi-Modal Integration (Weeks 3-4)**
- Add all 5 sensory workers + discriminators
- Implement Loki integration agent
- Cross-modal prediction mechanism
- Success: Plausible cross-modal predictions

**Phase 3: Global Coherence (Weeks 5-6)**
- Add global discriminator
- Episodic memory coherence checking
- Conflict detection and resolution
- Success: Coherence scores > 0.85

**Phase 4: Consolidation & Optimization (Weeks 7-8)**
- Offline replay mechanism
- Memory pruning and strengthening
- Performance tuning
- Success: 10+ events/minute sustained

---

### Advantages Over Original Loki Design

| Feature | Original Loki | OA-Loki (Enhanced) |
|---------|---------------|-------------------|
| Sensory Processing | Workers only | Workers + Discriminators |
| Feedback Mechanism | Manual/heuristic | Adversarial/learned |
| Cross-Modal Prediction | Implicit | Explicit with verification |
| Error Detection | Post-hoc analysis | Real-time discrimination |
| Learning Paradigm | Direct supervision | Self-supervised adversarial |
| Biological Inspiration | High-level (GWT, PP) | Mechanistic (cortical E-I) |
| Quality Assurance | None | Local + Global discriminators |
| Training Stability | N/A (no training) | Adversarial with oscillations |

---

### Connection to Original Theoretical Foundations

**Global Workspace Theory (Baars 1988):**
- **Original:** Loki broadcasts winning representations
- **Enhanced:** Global discriminator acts as "workspace gatekeeper" - only coherent representations broadcast

**Predictive Processing (Friston 2010):**
- **Original:** Implicit prediction in Loki
- **Enhanced:** Explicit predictions (Loki → Workers) with adversarial evaluation (Discriminators)

**Multi-Sensory Integration (Stein & Stanford 2008):**
- **Original:** Simple combination in Loki
- **Enhanced:** Adversarial cross-modal prediction + coherence assessment

**New Addition - Adversarial Learning (Benjamin & Kording 2023):**
- Cortical interneurons as discriminators
- Phase-dependent plasticity (Hebbian/anti-Hebbian)
- Oscillatory algorithm for distributed discrimination

---

## Summary: Why This Enhances Project Loki

1. **Biological Plausibility:** Maps directly to known cortical mechanisms (E-I feedback, oscillations)
2. **Quality Assurance:** Local + global discriminators catch errors in real-time
3. **Self-Supervised Learning:** System learns from experience without external labels
4. **Robustness:** Adversarial training makes representations more robust
5. **Scalability:** Local discriminators parallelize better than global evaluation
6. **Interpretability:** Discriminator scores provide explainable confidence metrics

**Bottom Line:** OA-Loki transforms Project Loki from a multi-sensory integration system into a **self-learning, adversarially-trained, brain-inspired cognitive architecture** that continuously improves through experience.

---

**Next Steps:**
1. Review this proposal with team
2. Approve Phase 1 implementation
3. Set up development environment (see `OA_LOKI_COMPUTATIONAL_REQUIREMENTS.md`)
4. Begin 8-week implementation timeline

**Documentation References:**
- Full research: `docs/research/BRAIN_OSCILLATIONS_ADVERSARIAL_NETWORKS_RESEARCH.md`
- Complete architecture: `docs/architecture/PROJECT_LOKI_OSCILLATORY_ADVERSARIAL_IMPLEMENTATION.md`
- Hardware specs: `docs/architecture/OA_LOKI_COMPUTATIONAL_REQUIREMENTS.md`
- Quick index: `docs/research/RESEARCH_INDEX.md`

---

**Document Status:** Design Proposal - Ready for Team Review  
**Author:** Mimir Development Team  
**Date:** November 10, 2025  
**Version:** 1.0.0
