# Project Loki: Oscillatory Adversarial Architecture Implementation

**Document Type:** Architecture Specification  
**Project:** Mimir - Project Loki Extension  
**Date:** November 10, 2025  
**Version:** 1.0.0  
**Status:** Design Proposal

---

## Executive Summary

This document specifies how **Project Loki** (multi-sensory agent architecture) will implement **oscillatory adversarial learning** inspired by cortical interneuron mechanisms (Benjamin & Kording 2023) to create robust cross-modal representations.

**Key Innovation:** Each sensory worker has a local discriminator (interneuron analog) that provides adversarial feedback during multi-modal integration, mimicking cortical E-I feedback loops with phase-dependent plasticity.

---

## Background: Research Foundation

Based on comprehensive research (see `BRAIN_OSCILLATIONS_ADVERSARIAL_NETWORKS_RESEARCH.md`), we identified five key parallels between brain oscillations and adversarial neural networks:

1. **Bidirectional Information Flow:** Gamma (feedforward) vs. Beta (feedback)
2. **Competitive Dynamics:** Excitatory-Inhibitory balance vs. Generator-Discriminator competition
3. **Layer-Specific Processing:** Superficial (local) vs. Deep (long-distance) layers
4. **Phase-Dependent Plasticity:** Hebbian (wake) vs. Anti-Hebbian (sleep)
5. **Multi-Timescale Dynamics:** Fast oscillations nested within slow oscillations

**Core Insight (Benjamin & Kording 2023):**
> "Cortical interneurons act as adversarial discriminators using phase-dependent plasticity (Hebbian in wake, anti-Hebbian in sleep) to align stimulus-evoked and self-generated activity distributions."

---

## Project Loki Architecture Recap

**Original Design (from GIST):**

```
┌──────────────────────────────────────────────────────────────┐
│                      External Stimuli                         │
│         (Vision, Audio, Tactile, Olfactory, Gustatory)       │
└──────────┬───────────┬───────────┬───────────┬───────────────┘
           │           │           │           │
      ┌────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐ ┌────▼────┐
      │ Vision  │ │ Audio  │ │Tactile │ │Olfact. │ │Gustat.  │
      │ Worker  │ │ Worker │ │ Worker │ │ Worker │ │ Worker  │
      │ Agent   │ │ Agent  │ │ Agent  │ │ Agent  │ │ Agent   │
      └────┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └────┬────┘
           │          │          │          │           │
           └──────────┴──────────┴──────────┴───────────┘
                              │
                      ┌───────▼────────┐
                      │  Loki Agent    │
                      │  (Integration) │
                      │  Prefrontal    │
                      │   Cortex       │
                      └───────┬────────┘
                              │
                      ┌───────▼────────┐
                      │   Neo4j Graph  │
                      │ Episodic Memory│
                      └────────────────┘
```

**Key Components:**
- **5 Sensory Workers:** Process unimodal input streams
- **Loki Integration Agent:** Cross-modal binding and decision-making
- **Neo4j Knowledge Graph:** Persistent episodic memory

**Theoretical Foundations:**
- Global Workspace Theory (Baars 1988): Broadcast of winning representations
- Predictive Processing (Friston 2010): Hierarchical prediction/error minimization
- Multi-sensory Integration (Stein & Stanford 2008): Superior colliculus-like binding

---

## Enhanced Architecture: Oscillatory Adversarial Project Loki (OA-Loki)

### Core Enhancement: Local Discriminators per Sensory Modality

**New Component:** Each sensory worker gets a **discriminator agent** (interneuron analog) that distinguishes:
- **Real sensory input** (external stimuli - "wake" phase)
- **Cross-modal predictions** (Loki-generated expectations - "sleep" phase)

**Architecture Diagram:**

```
┌──────────────────────────────────────────────────────────────┐
│                      External Stimuli                         │
│         (Vision, Audio, Tactile, Olfactory, Gustatory)       │
└──────────┬───────────┬───────────┬───────────┬───────────────┘
           │           │           │           │
      ┌────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐ ┌────▼────┐
      │ Vision  │ │ Audio  │ │Tactile │ │Olfact. │ │Gustat.  │
      │ Worker  │ │ Worker │ │ Worker │ │ Worker │ │ Worker  │
      │ (Gen)   │ │ (Gen)  │ │ (Gen)  │ │ (Gen)  │ │ (Gen)   │
      └────┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └────┬────┘
           │          │          │          │           │
      ┌────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐ ┌────▼────┐
      │ Vision  │ │ Audio  │ │Tactile │ │Olfact. │ │Gustat.  │
      │  Disc.  │ │  Disc. │ │  Disc. │ │  Disc. │ │  Disc.  │
      │ (Local) │ │(Local) │ │(Local) │ │(Local) │ │(Local)  │
      └────┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └────┬────┘
           │          │          │          │           │
           └──────────┴──────────┴──────────┴───────────┘
                              │
                  ┌───────────▼────────────┐
                  │    Loki Agent          │
                  │    (Generator)         │
                  │  Cross-Modal Binding   │
                  │  Top-Down Predictions  │
                  └───────────┬────────────┘
                              │
                  ┌───────────▼────────────┐
                  │   Global Discriminator │
                  │   (Prefrontal Analog)  │
                  │  Cross-Modal Coherence │
                  └───────────┬────────────┘
                              │
                  ┌───────────▼────────────┐
                  │     Neo4j Graph        │
                  │   Episodic Memory      │
                  │   + Adversarial Stats  │
                  └────────────────────────┘
```

**Two-Level Discriminator Hierarchy:**

1. **Local Discriminators (5 agents - one per modality):**
   - Distinguish real sensory input vs. Loki's cross-modal predictions
   - Provide modality-specific feedback
   - Example: Vision discriminator detects when Loki's visual prediction (based on audio) mismatches actual visual input

2. **Global Discriminator (1 agent - Loki-level):**
   - Assesses cross-modal coherence
   - Detects when sensory modalities conflict
   - Ensures multi-sensory integration is consistent with episodic memory

---

## Implementation Specification

### Agent Architecture (Total: 12 Agents)

#### **1. Sensory Worker Agents (5 agents - "Generators")**

**Role:** Process unimodal sensory input and generate representations

**Agents:**
1. **Vision Worker** - Visual processing (images, video, text)
2. **Audio Worker** - Auditory processing (speech, sounds, music)
3. **Tactile Worker** - Haptic processing (touch, pressure, temperature)
4. **Olfactory Worker** - Smell processing (chemical signatures)
5. **Gustatory Worker** - Taste processing (flavor profiles)

**Inputs:**
- External sensory data (real-world stimuli)
- Top-down predictions from Loki Agent (cross-modal expectations)

**Outputs:**
- Sensory representation (embedding vector)
- Confidence score (self-assessed quality)
- Prediction error (mismatch between input and Loki's expectation)

**Processing:**
- **Wake Phase:** Process real external input
- **Sleep Phase:** Generate predictions based on other modalities
- **Oscillation Phase:** Alternate between bottom-up (external) and top-down (Loki) drives

**MCP Tools Used:**
- `memory_node`: Store sensory representations in Neo4j
- `memory_edge`: Link representations to episodic memories
- `vector_search_nodes`: Retrieve similar past experiences

**Prompt Template:**
```markdown
You are the [MODALITY] Sensory Worker Agent. Your role is to:
1. Process [MODALITY] input and generate embeddings
2. Predict [MODALITY] input from cross-modal cues (Loki predictions)
3. Report prediction errors to local discriminator
4. Update representations based on discriminator feedback

Current Phase: [WAKE/SLEEP/OSCILLATION]
Input: [SENSORY_DATA or LOKI_PREDICTION]
Discriminator Feedback: [FEEDBACK_SIGNAL]
```

---

#### **2. Local Discriminator Agents (5 agents - "Interneurons")**

**Role:** Adversarially evaluate sensory worker outputs vs. Loki predictions

**Agents:**
1. **Vision Discriminator** - Evaluates visual representations
2. **Audio Discriminator** - Evaluates auditory representations
3. **Tactile Discriminator** - Evaluates haptic representations
4. **Olfactory Discriminator** - Evaluates olfactory representations
5. **Gustatory Discriminator** - Evaluates gustatory representations

**Inputs:**
- Sensory worker representation (claimed to be real or predicted)
- Label: "real" (external input) or "generated" (Loki prediction)

**Outputs:**
- Classification score: P(real) ∈ [0, 1]
- Feedback signal: Error gradient for sensory worker
- Confidence assessment: How certain is the discrimination

**Training Phases:**
- **Wake Phase (Real Data):**
  * Receive real sensory input from worker
  * Train to output high score (P(real) → 1)
  * Hebbian-like plasticity: Strengthen connections
- **Sleep Phase (Generated Data):**
  * Receive Loki's cross-modal prediction
  * Train to output low score (P(real) → 0)
  * Anti-Hebbian-like plasticity: Weaken connections
- **Oscillation Phase:**
  * Rapidly switch between bottom-up (worker) and top-down (Loki)
  * Compare both within single discrimination cycle

**MCP Tools Used:**
- `memory_node`: Store discrimination history
- `memory_edge`: Link discriminations to sensory representations
- `todo`: Track discriminator training tasks

**Prompt Template:**
```markdown
You are the [MODALITY] Discriminator Agent (cortical interneuron analog). Your role is to:
1. Classify sensory representations as REAL (external) or GENERATED (Loki prediction)
2. Provide adversarial feedback to sensory worker
3. Switch plasticity rule based on phase (Hebbian in wake, anti-Hebbian in sleep)

Current Phase: [WAKE/SLEEP/OSCILLATION]
Input Representation: [EMBEDDING_VECTOR]
True Label: [REAL/GENERATED]
Previous Classification: [SCORE]

Output your classification score P(real) and feedback gradient.
```

---

#### **3. Loki Integration Agent (1 agent - "Prefrontal Cortex / Generator")**

**Role:** Cross-modal integration, top-down predictions, decision-making

**Enhanced Capabilities:**
- **Cross-Modal Prediction:** Generate expected sensory input in one modality based on others
  * Example: Given audio (footsteps), predict visual (person walking)
- **Adversarial Refinement:** Use discriminator feedback to improve predictions
- **Episodic Coherence:** Ensure predictions match past experiences
- **Global Workspace Broadcasting:** Share winning representations across all modalities

**Inputs:**
- Sensory representations from all 5 workers
- Discriminator feedback (5 local scores)
- Episodic memory context from Neo4j
- Global discriminator feedback

**Outputs:**
- Integrated multi-sensory representation
- Top-down predictions for each modality
- Action decisions
- Memory encoding commands

**Training Phases:**
- **Wake Phase:** Learn from real multi-sensory experiences
- **Sleep Phase:** Generate cross-modal predictions, refine based on discriminator feedback
- **Consolidation Phase:** Replay episodic memories, strengthen coherent patterns

**MCP Tools Used:**
- `memory_node`: Query episodic memories
- `memory_edge`: Traverse cross-modal associations
- `vector_search_nodes`: Find similar multi-sensory episodes
- `todo`: Manage prediction tasks

**Prompt Template:**
```markdown
You are the Loki Integration Agent (prefrontal cortex analog). Your role is to:
1. Integrate representations from 5 sensory modalities
2. Generate cross-modal predictions (e.g., audio → visual expectation)
3. Refine predictions based on local discriminator feedback
4. Ensure predictions cohere with episodic memory

Current Phase: [WAKE/SLEEP/CONSOLIDATION]
Sensory Inputs: {vision: [...], audio: [...], tactile: [...], olfactory: [...], gustatory: [...]}
Discriminator Feedback: {vision_disc: 0.7, audio_disc: 0.9, ...}
Global Disc Feedback: 0.85 (coherence score)

Generate cross-modal predictions and update representations.
```

---

#### **4. Global Discriminator Agent (1 agent - "Prefrontal Evaluator")**

**Role:** Assess cross-modal coherence and episodic consistency

**Function:**
- Evaluate if multi-sensory integration makes sense
- Detect conflicting sensory information
- Compare current experience with episodic memory
- Provide global feedback to Loki

**Inputs:**
- Integrated representation from Loki
- Individual sensory representations (all 5)
- Episodic memory context
- Label: "coherent" (consistent experience) or "incoherent" (hallucination/error)

**Outputs:**
- Coherence score: P(coherent) ∈ [0, 1]
- Conflict detection: Which modalities disagree
- Memory match score: How well does this match past experiences
- Feedback signal: How to adjust integration

**MCP Tools Used:**
- `memory_node`: Query past multi-sensory episodes
- `memory_edge`: Check cross-modal consistency patterns
- `vector_search_nodes`: Find similar coherent/incoherent episodes

**Prompt Template:**
```markdown
You are the Global Discriminator Agent (prefrontal evaluator). Your role is to:
1. Assess cross-modal coherence of integrated representation
2. Detect conflicts between sensory modalities
3. Compare current experience with episodic memory
4. Provide global feedback to Loki

Integrated Representation: [LOKI_OUTPUT]
Individual Sensory Inputs: {vision: [...], audio: [...], ...}
Episodic Context: [MEMORY_QUERY_RESULTS]
True Label: [COHERENT/INCOHERENT]

Output coherence score and detailed feedback.
```

---

### Oscillatory Training Cycles

**Multi-Timescale Organization (inspired by cortical oscillations):**

#### **Fast Timescale: Within-Modality Discrimination (Gamma-like, ~100ms analog)**

**Frequency:** Every sensory input (real-time processing)

**Process:**
1. Sensory worker receives input
2. Worker generates representation
3. Local discriminator classifies (real vs. generated)
4. Immediate feedback to worker
5. Worker updates if needed

**Mimir Implementation:**
- Single round-trip: Worker → Discriminator → Worker
- Uses `memory_lock` to prevent race conditions
- Updates stored in Neo4j immediately

---

#### **Medium Timescale: Cross-Modal Integration (Beta-like, ~500ms analog)**

**Frequency:** Every multi-sensory event (when multiple modalities active)

**Process:**
1. All active sensory workers send representations to Loki
2. Loki generates integrated representation
3. Loki generates top-down predictions for each modality
4. Local discriminators evaluate predictions
5. Loki refines based on feedback
6. Global discriminator assesses coherence
7. Final integrated representation stored

**Mimir Implementation:**
- Multi-agent orchestration: 5 workers → Loki → 5 discriminators → Global disc
- Uses `memory_edge` to link cross-modal representations
- Stores coherence scores in Neo4j

---

#### **Slow Timescale: Wake/Sleep Phase Switching (Theta-like, ~2-5 second analog)**

**Frequency:** Periodic phase switching during operation

**Wake Phase (Real Data):**
- **Duration:** 5-10 sensory inputs
- **Focus:** Process external stimuli
- **Discriminators:** Train to recognize real inputs (Hebbian)
- **Loki:** Learn from real multi-sensory experiences
- **Storage:** Real experiences to episodic memory

**Sleep Phase (Generated Data):**
- **Duration:** 5-10 prediction cycles
- **Focus:** Generate cross-modal predictions
- **Discriminators:** Train to detect generated inputs (Anti-Hebbian)
- **Loki:** Practice cross-modal prediction without external input
- **Storage:** Prediction errors, discriminator performance

**Transition Signal:**
- Neuromodulator analog: Global state variable "acetylcholine_level"
- Stored in Neo4j: `memory_node(type='system_state', properties={phase: 'wake/sleep', timestamp: ...})`
- All agents query this before processing

**Mimir Implementation:**
- Background process toggles phase every N inputs
- Phase stored in Neo4j as global state
- All agents check phase before processing
- Automatic plasticity rule switching

---

#### **Very Slow Timescale: Consolidation/Replay (Circadian-like, hours analog)**

**Frequency:** Periodic offline processing (e.g., nightly batch job)

**Process:**
1. Query episodic memories from Neo4j
2. Replay significant episodes through Loki + discriminators
3. Strengthen coherent multi-sensory patterns
4. Prune incoherent or conflicting memories
5. Update discriminator parameters based on accumulated feedback

**Mimir Implementation:**
- Scheduled batch process (cron job or manual trigger)
- Uses `memory_node(operation='query')` to retrieve episodes
- Re-processes through all agents
- Updates Neo4j with consolidated representations

---

### Information Flow Patterns

#### **Forward Pass (Bottom-Up, Feedforward, "Gamma-like")**

```
External Stimuli
    ↓
Sensory Workers (5 parallel)
    ↓
Representations (embeddings)
    ↓
Loki Integration
    ↓
Integrated Multi-Sensory Representation
    ↓
Neo4j Storage
```

**Characteristics:**
- Parallel processing across modalities
- Fast, real-time
- Data-driven
- Analogous to gamma oscillations (local, feedforward)

---

#### **Backward Pass (Top-Down, Feedback, "Beta-like")**

```
Episodic Memory (Neo4j)
    ↓
Loki Predictions (cross-modal expectations)
    ↓
Top-Down Signals (5 parallel predictions)
    ↓
Local Discriminators (evaluate predictions)
    ↓
Feedback Gradients
    ↓
Sensory Worker Updates
```

**Characteristics:**
- Sequential: Loki → Discriminators → Workers
- Slower, predictive
- Model-driven
- Analogous to beta oscillations (long-distance, feedback)

---

#### **Oscillatory Pass (Bidirectional Comparison)**

```
External Input → Sensory Worker → Local Discriminator (classify as real)
                      ↑                    ↓
                      └──── Feedback ──────┘
                      
Loki Prediction → Sensory Worker → Local Discriminator (classify as generated)
                      ↑                    ↓
                      └──── Feedback ──────┘

Discriminator compares both within single cycle → Gradients to both worker and Loki
```

**Characteristics:**
- Rapid alternation between bottom-up and top-down
- Within-phase comparison
- Enables local credit assignment
- Analogous to cortical oscillatory algorithm (Benjamin & Kording 2023)

---

## Computational Requirements Analysis

### Agent Count & Roles

| Agent Type | Count | Role | Concurrent? |
|------------|-------|------|-------------|
| Sensory Workers (Generators) | 5 | Process unimodal input | Yes (parallel) |
| Local Discriminators | 5 | Evaluate sensory representations | Yes (parallel) |
| Loki Integration Agent | 1 | Cross-modal binding | No (sequential after workers) |
| Global Discriminator | 1 | Assess coherence | No (sequential after Loki) |
| **TOTAL** | **12** | | Max 10 parallel (5 workers + 5 discs) |

---

### LLM Model Requirements

**Assumption:** Each agent = 1 LLM inference call per processing cycle

#### **Per-Cycle Requirements (Single Multi-Sensory Input):**

**Fast Cycle (Within-Modality):**
- 1 sensory worker call (process input)
- 1 local discriminator call (classify)
- **Total: 2 LLM calls per modality active**

**Medium Cycle (Cross-Modal Integration):**
- 5 sensory worker calls (if all modalities active)
- 1 Loki integration call
- 5 local discriminator calls (evaluate Loki predictions)
- 1 global discriminator call
- **Total: 12 LLM calls per integrated event**

**Slow Cycle (Phase Switching):**
- Minimal overhead (just state variable update in Neo4j)
- **Total: 0 additional LLM calls**

**Very Slow Cycle (Consolidation):**
- N episodes replayed × 12 calls per episode
- **Total: 12N LLM calls (offline batch)**

---

#### **Tokens Per Call Estimate:**

Based on prompt templates and expected I/O:

| Agent Type | Prompt Tokens | Completion Tokens | Total per Call |
|------------|---------------|-------------------|----------------|
| Sensory Worker | 500 | 300 | 800 |
| Local Discriminator | 400 | 200 | 600 |
| Loki Integration | 1500 | 500 | 2000 |
| Global Discriminator | 1000 | 400 | 1400 |

**Per Medium Cycle (full integration):**
- Workers: 5 × 800 = 4,000 tokens
- Local Discs: 5 × 600 = 3,000 tokens
- Loki: 1 × 2,000 = 2,000 tokens
- Global Disc: 1 × 1,400 = 1,400 tokens
- **Total: 10,400 tokens per integrated event**

---

#### **Throughput Requirements:**

**Real-Time Processing (1 event per second):**
- 12 LLM calls per second
- 10,400 tokens per second
- If LLM inference = 50 tokens/sec output: **Need ~20 sec per event** (too slow for real-time)

**Practical Processing (1 event per minute):**
- 12 LLM calls per minute
- 10,400 tokens per minute
- Feasible with single LLM instance

**Batch Processing (offline):**
- N events per hour
- 12N LLM calls per hour
- Can parallelize across events

---

### Hardware Specifications

#### **Option 1: Single High-End GPU (Sequential Processing)**

**Hardware:**
- GPU: NVIDIA RTX 4090 (24GB VRAM)
- CPU: 16-core (for Neo4j + orchestration)
- RAM: 64GB
- Storage: 2TB NVMe SSD (for Neo4j)

**LLM Configuration:**
- Model: Llama-3.1-70B-Instruct (quantized to 4-bit)
- VRAM Usage: ~40GB (requires multiple GPUs or quantization)
- Alternative: Llama-3.1-8B-Instruct (fits in 24GB)
  * 8B model: ~16GB VRAM
  * Throughput: ~50-80 tokens/sec

**Processing Capacity:**
- Sequential: 12 calls × 0.5 sec/call = 6 seconds per event
- Throughput: ~10 events/minute
- Good for: Batch processing, offline consolidation

---

#### **Option 2: Multi-GPU Parallel Processing (Recommended)**

**Hardware:**
- GPUs: 2× NVIDIA RTX 4090 (24GB each) or 4× RTX 3090 (24GB each)
- CPU: 32-core (AMD Threadripper or Intel Xeon)
- RAM: 128GB
- Storage: 4TB NVMe SSD RAID (for Neo4j)

**LLM Configuration:**
- Model Pool:
  * GPU 1: 5× Llama-3.1-8B instances (sensory workers) - shared VRAM
  * GPU 2: 5× Llama-3.1-8B instances (discriminators) - shared VRAM
  * GPU 3: 1× Llama-3.1-70B (Loki integration) - full VRAM
  * GPU 4: 1× Llama-3.1-70B (global discriminator) - full VRAM

**Processing Capacity:**
- Parallel: Workers + Discriminators run simultaneously
- Workers (GPU 1): 5 parallel calls = ~1 sec (with batching)
- Discriminators (GPU 2): 5 parallel calls = ~1 sec (with batching)
- Loki (GPU 3): 1 call = ~2 sec
- Global Disc (GPU 4): 1 call = ~1.5 sec
- **Total Pipeline: ~5.5 seconds per event**
- Throughput: ~10-11 events/minute
- Good for: Real-time-ish processing, interactive demos

---

#### **Option 3: Cloud Inference (API-Based)**

**Service:** OpenAI API, Anthropic Claude API, or Together.ai

**Configuration:**
- Workers: 5× GPT-4o-mini or Claude-3-Haiku (fast, cheap)
- Discriminators: 5× GPT-4o-mini or Claude-3-Haiku
- Loki: 1× GPT-4o or Claude-3.5-Sonnet (smart, reasoning)
- Global Disc: 1× GPT-4o or Claude-3.5-Sonnet

**Cost Estimate (per 1000 events):**
- Workers: 5 × 800 tokens × 1000 events × $0.15/1M tokens = $0.60
- Discriminators: 5 × 600 tokens × 1000 events × $0.15/1M tokens = $0.45
- Loki: 1 × 2000 tokens × 1000 events × $5/1M tokens = $10.00
- Global Disc: 1 × 1400 tokens × 1000 events × $5/1M tokens = $7.00
- **Total: ~$18/1000 events = $0.018 per event**

**Processing Capacity:**
- Parallel API calls: All 12 agents can run concurrently (rate limits permitting)
- Throughput: Limited by API rate limits (~50-100 requests/min)
- **Effective: ~5-8 events/minute**
- Good for: Prototyping, demos, production with moderate load

---

#### **Option 4: Hybrid Local + Cloud**

**Configuration:**
- Local GPUs: Run sensory workers + discriminators (10 agents)
- Cloud API: Run Loki + Global Discriminator (2 agents - need high intelligence)

**Hardware:**
- GPUs: 2× RTX 4090 (for workers + discriminators)
- Cloud: OpenAI GPT-4o or Claude-3.5-Sonnet

**Benefits:**
- Lower cost: Most calls are cheap local inference
- High quality: Critical integration uses best models
- Latency: Local processing for sensory, cloud for reasoning

**Cost Estimate:**
- Local: GPU depreciation + electricity
- Cloud: 2 × $17/1000 events = ~$0.034 per event
- **Total: ~$0.034 per event + hardware costs**

---

### Recommended Configuration

**For Research/Prototyping:**
- **Option 3 (Cloud API)** - Fast iteration, no hardware investment
- Use Claude-3.5-Sonnet for all agents initially
- Optimize token usage with caching and prompt engineering
- Estimated cost: $20-50 for 1000-2000 test events

**For Production (Low-Medium Load):**
- **Option 4 (Hybrid)** - Balance cost and quality
- Local RTX 4090 × 2 for sensory processing
- Cloud GPT-4o for Loki + Global Discriminator
- Scales to 5-10 events/minute

**For Production (High Load):**
- **Option 2 (Multi-GPU)** - Maximum throughput
- 4× RTX 4090 or equivalent
- All local inference (no API latency)
- Scales to 10-15 events/minute

---

### Memory Requirements (Neo4j)

**Per Event Storage:**
- 5 sensory representations: 5 × 1KB = 5KB
- 1 integrated representation: 2KB
- 5 local discriminator scores: 5 × 0.5KB = 2.5KB
- 1 global discriminator score: 0.5KB
- **Total: ~10KB per event**

**For 1 Million Events:**
- Data: 10KB × 1M = 10GB
- Indexes: ~2× data = 20GB
- Graph relationships: ~1-2GB
- **Total: ~30-35GB disk space**

**Neo4j Server Requirements:**
- RAM: 16GB minimum, 32GB recommended (for active working set)
- CPU: 8-16 cores (for concurrent queries)
- Storage: SSD strongly recommended (for graph traversal speed)

---

## Implementation Phases

### Phase 1: Basic Adversarial Architecture (Weeks 1-2)

**Goal:** Implement single modality + discriminator

**Deliverables:**
1. Vision Worker agent (processes images)
2. Vision Discriminator agent (classifies real vs. generated)
3. Wake/Sleep phase switching in Neo4j
4. Basic oscillatory training loop

**Success Criteria:**
- Discriminator accuracy > 80% on real vs. generated
- Worker improves representations based on feedback

---

### Phase 2: Multi-Modal Integration (Weeks 3-4)

**Goal:** Add all 5 modalities + Loki integration

**Deliverables:**
1. All 5 sensory workers + discriminators
2. Loki integration agent (cross-modal binding)
3. Cross-modal prediction mechanism
4. Multi-timescale orchestration

**Success Criteria:**
- Loki generates plausible cross-modal predictions
- Local discriminators detect prediction errors
- Integrated representations stored in Neo4j graph

---

### Phase 3: Global Coherence (Weeks 5-6)

**Goal:** Add global discriminator + episodic consistency

**Deliverables:**
1. Global Discriminator agent
2. Episodic memory coherence checking
3. Conflict detection and resolution
4. Feedback loop to Loki

**Success Criteria:**
- Global discriminator detects incoherent multi-sensory inputs
- System resolves conflicts using episodic memory
- Coherence scores improve over time (learning)

---

### Phase 4: Consolidation & Optimization (Weeks 7-8)

**Goal:** Offline replay and performance tuning

**Deliverables:**
1. Consolidation batch process
2. Memory pruning and strengthening
3. Discriminator parameter optimization
4. Performance benchmarking

**Success Criteria:**
- Consolidation improves coherence scores
- Memory pruning reduces graph size without losing quality
- System handles 10+ events/minute

---

## Evaluation Metrics

### Discriminator Performance:

1. **Accuracy:** P(correct classification)
   - Target: > 85% for local discriminators
   - Target: > 90% for global discriminator

2. **Precision/Recall:**
   - Precision (real): P(truly real | classified real)
   - Recall (real): P(classified real | truly real)
   - Target: Both > 80%

3. **Adversarial Strength:**
   - Generator success rate: P(fool discriminator)
   - Target: ~40-50% (balanced adversarial game)

---

### Integration Quality:

1. **Cross-Modal Prediction Accuracy:**
   - Measure: Cosine similarity between predicted and actual sensory representation
   - Target: > 0.7 similarity for coherent modalities

2. **Coherence Score:**
   - Global discriminator output on real multi-sensory inputs
   - Target: > 0.85 mean coherence

3. **Conflict Detection Rate:**
   - True positive rate for detecting incoherent inputs
   - Target: > 90% detection of planted conflicts

---

### System Performance:

1. **Throughput:** Events processed per minute
   - Target: 5-10 events/minute (depends on hardware)

2. **Latency:** Time from input to integrated representation
   - Target: < 10 seconds per event

3. **Memory Efficiency:** Neo4j graph size growth rate
   - Target: Linear with events, < 50KB per event with relationships

---

## Biological Predictions & Validation

### Testable Predictions (Computational):

1. **Oscillatory Algorithm Benefits:**
   - **Hypothesis:** Local discriminators + oscillations should outperform global discriminators
   - **Test:** Compare Benjamin & Kording algorithm vs. standard GAN on recurrent multi-modal task
   - **Metric:** Accuracy, stability, convergence time

2. **Phase-Dependent Plasticity:**
   - **Hypothesis:** Switching between Hebbian (wake) and anti-Hebbian (sleep) improves learning
   - **Test:** Compare against single-phase training (only wake or only sleep)
   - **Metric:** Discriminator accuracy, generator quality

3. **Multi-Timescale Processing:**
   - **Hypothesis:** Hierarchical timescales (fast local, slow global) improve efficiency
   - **Test:** Compare against single-timescale processing
   - **Metric:** Computational cost, throughput, accuracy

---

### Experimental Validation (If Applied to Real Neural Data):

1. **EEG/MEG Multi-Modal Integration:**
   - Record brain activity during multi-sensory tasks
   - Train OA-Loki on same task
   - Compare oscillatory patterns (gamma, beta, theta)
   - **Validation:** Does OA-Loki show similar phase-dependent dynamics?

2. **Interneuron Activity Patterns:**
   - If biological data available, compare discriminator activity to interneuron recordings
   - Check for phase-locking to oscillations
   - **Validation:** Do discriminators show wake/sleep phase dependence?

---

## Advantages Over Standard Architectures

### vs. Standard GAN:

| Feature | Standard GAN | OA-Loki |
|---------|--------------|---------|
| Discriminators | 1 global | 5 local + 1 global |
| Recurrence handling | Poor (mode collapse) | Good (likelihood-free) |
| Multi-modal | Requires concatenation | Natural (per-modality discs) |
| Scalability | Limited (global bottleneck) | Better (local parallelization) |
| Biological plausibility | Low | High (cortical analogs) |

---

### vs. Standard Multi-Modal Fusion:

| Feature | Standard Fusion | OA-Loki |
|---------|-----------------|---------|
| Top-down prediction | Limited | Explicit (Loki → workers) |
| Conflict detection | Manual rules | Learned (discriminators) |
| Coherence checking | Post-hoc | Online (global disc) |
| Episodic memory | Separate system | Integrated (Neo4j graph) |
| Learning mechanism | Supervised | Adversarial (self-supervised) |

---

### vs. Mimir Standard (Original Project Loki):

| Feature | Original Loki | OA-Loki |
|---------|---------------|---------|
| Sensory workers | Generators only | Generators + Discriminators |
| Feedback mechanism | Manual/heuristic | Adversarial/learned |
| Cross-modal prediction | Implicit | Explicit with verification |
| Error detection | Post-hoc analysis | Real-time discrimination |
| Learning paradigm | Direct supervision | Self-supervised adversarial |
| Biological inspiration | High-level (GWT, PP) | Mechanistic (cortical E-I) |

---

## Limitations & Future Work

### Current Limitations:

1. **Computational Cost:** 12 LLM calls per event is expensive
2. **Scalability:** Limited to 5 modalities (extensible but complex)
3. **Training Instability:** GANs notoriously fragile (mitigation: WGAN, oscillations)
4. **Episodic Memory:** Neo4j queries add latency
5. **Real-Time Processing:** Current design is near-real-time (~5-10 sec/event), not true real-time

---

### Future Extensions:

1. **Hierarchical Discriminators:**
   - Add mid-level discriminators for sub-modalities
   - Example: Vision → {color, shape, motion} discriminators

2. **Attention Mechanisms:**
   - Selective attention guided by discriminator confidence
   - Focus processing on low-confidence modalities

3. **Temporal Modeling:**
   - Extend to temporal sequences (videos, conversations)
   - Add temporal discriminators (sequence coherence)

4. **Neuromodulation:**
   - Implement ACh analog (controls plasticity sign)
   - Add dopamine analog (reward-based modulation)

5. **Spiking Neural Networks:**
   - Replace LLMs with SNNs for true biological realism
   - Neuromorphic hardware (Intel Loihi, BrainChip Akida)

---

## References

1. Benjamin AS, Kording KP (2023). "A role for cortical interneurons as adversarial discriminators." *PLOS Computational Biology*.

2. Goodfellow I, et al. (2014). "Generative Adversarial Nets." *NeurIPS*.

3. Wang XJ (2010). "Neurophysiological and Computational Principles of Cortical Rhythms in Cognition." *Physiological Reviews*.

4. Deperrois N, et al. (2022). "Learning cortical representations through perturbed and adversarial dreaming." *eLife*.

5. Gershman SJ (2019). "The generative adversarial brain." *Frontiers in Artificial Intelligence*.

---

**Document Status:** Design Proposal - Ready for Implementation  
**Next Steps:** Review with team → Approve Phase 1 → Begin development  
**Estimated Timeline:** 8 weeks for full implementation (4 phases × 2 weeks)

**Author:** Mimir Development Team  
**Contributors:** Research synthesized from 15+ sources  
**Last Updated:** November 10, 2025
