# Computational Requirements & Hardware Specifications: OA-Loki System

**Document Type:** Technical Specification  
**Project:** Mimir - Oscillatory Adversarial Project Loki (OA-Loki)  
**Date:** November 10, 2025  
**Version:** 1.0.0

---

## Executive Summary

This document provides detailed computational requirements, hardware specifications, and deployment configurations for the **Oscillatory Adversarial Project Loki (OA-Loki)** system - a brain-inspired multi-agent architecture with 12 concurrent LLM-based agents.

**Key Findings:**
- **Agent Count:** 12 total (5 sensory workers + 5 discriminators + 1 Loki + 1 global discriminator)
- **Concurrency:** Up to 10 agents parallel (5 workers + 5 discriminators)
- **Tokens per Event:** ~10,400 tokens per fully integrated multi-sensory event
- **Recommended Hardware:** 2-4 GPUs (NVIDIA RTX 4090) or cloud API
- **Estimated Cost (Cloud):** $0.018 per event (~$18/1000 events)
- **Throughput Target:** 5-15 events/minute (hardware dependent)

---

## System Architecture Overview

### Agent Composition

```
Total Agents: 12

Sensory Layer (10 agents - parallelizable):
├─ Vision Worker → Vision Discriminator
├─ Audio Worker → Audio Discriminator  
├─ Tactile Worker → Tactile Discriminator
├─ Olfactory Worker → Olfactory Discriminator
└─ Gustatory Worker → Gustatory Discriminator

Integration Layer (2 agents - sequential):
├─ Loki Integration Agent (cross-modal binding)
└─ Global Discriminator (coherence assessment)

Support Infrastructure:
├─ Neo4j Graph Database (episodic memory)
├─ Phase Controller (wake/sleep switching)
└─ Orchestration Manager (agent coordination)
```

---

## Computational Workload Analysis

### Processing Pipeline (Single Multi-Sensory Event)

#### **Stage 1: Sensory Processing (Parallel - 5 workers)**

**Input:** Raw sensory data (all 5 modalities)

**Process:**
```
For each modality in [vision, audio, tactile, olfactory, gustatory]:
    1. Worker receives sensory input
    2. Worker generates embedding representation
    3. Worker outputs (representation, confidence, metadata)
```

**Computational Requirements:**
- **LLM Calls:** 5 (one per worker, parallel)
- **Tokens per Worker:**
  * Input: ~300 tokens (sensory data description + context)
  * Output: ~200 tokens (embedding representation + metadata)
  * Total: ~500 tokens per worker
- **Total Stage 1:** 5 × 500 = **2,500 tokens**
- **Latency:** ~1-2 seconds (parallel execution on 5 GPU instances)

---

#### **Stage 2: Local Discrimination (Parallel - 5 discriminators)**

**Input:** Sensory worker outputs (5 representations)

**Process:**
```
For each discriminator in [vision_disc, audio_disc, tactile_disc, olfactory_disc, gustatory_disc]:
    1. Discriminator receives worker representation
    2. Discriminator classifies: P(real) ∈ [0,1]
    3. Discriminator outputs (score, feedback gradient, confidence)
```

**Computational Requirements:**
- **LLM Calls:** 5 (one per discriminator, parallel)
- **Tokens per Discriminator:**
  * Input: ~250 tokens (representation + phase state + history)
  * Output: ~150 tokens (classification score + feedback)
  * Total: ~400 tokens per discriminator
- **Total Stage 2:** 5 × 400 = **2,000 tokens**
- **Latency:** ~1-2 seconds (parallel execution on 5 GPU instances)

---

#### **Stage 3: Cross-Modal Integration (Sequential - 1 Loki agent)**

**Input:** All 5 sensory representations + local discriminator feedback

**Process:**
```
Loki Integration Agent:
    1. Receive representations from all 5 workers
    2. Receive discriminator feedback (5 scores)
    3. Query episodic memory (Neo4j) for context
    4. Generate integrated multi-sensory representation
    5. Generate top-down predictions for each modality
    6. Output (integrated_rep, 5 predictions, confidence)
```

**Computational Requirements:**
- **LLM Calls:** 1 (Loki agent, sequential after Stage 2)
- **Tokens:**
  * Input: ~1,000 tokens (5 representations + 5 disc scores + memory context + instructions)
  * Output: ~500 tokens (integrated rep + 5 predictions + reasoning)
  * Total: ~1,500 tokens
- **Total Stage 3:** **1,500 tokens**
- **Latency:** ~2-3 seconds (single large model inference)

---

#### **Stage 4: Global Coherence Assessment (Sequential - 1 global discriminator)**

**Input:** Loki's integrated representation + all sensory inputs + episodic context

**Process:**
```
Global Discriminator:
    1. Receive integrated representation from Loki
    2. Receive original sensory inputs (all 5)
    3. Query episodic memory for similar past experiences
    4. Assess cross-modal coherence: P(coherent) ∈ [0,1]
    5. Detect conflicts between modalities
    6. Output (coherence_score, conflicts, feedback, memory_match)
```

**Computational Requirements:**
- **LLM Calls:** 1 (global discriminator, sequential after Stage 3)
- **Tokens:**
  * Input: ~800 tokens (integrated rep + 5 sensory inputs + memory context)
  * Output: ~300 tokens (coherence assessment + conflict detection)
  * Total: ~1,100 tokens
- **Total Stage 4:** **1,100 tokens**
- **Latency:** ~1.5-2 seconds (single large model inference)

---

#### **Stage 5: Feedback & Storage (Database operations)**

**Process:**
```
1. Store integrated representation in Neo4j
2. Store all sensory representations with edges
3. Store discriminator scores and feedback
4. Update agent states and history
5. Trigger next phase if cycle complete
```

**Computational Requirements:**
- **LLM Calls:** 0 (pure database operations)
- **Neo4j Operations:**
  * 5 CREATE nodes (sensory representations)
  * 1 CREATE node (integrated representation)
  * 10 CREATE edges (linking representations)
  * 5 UPDATE nodes (discriminator scores)
  * 1 UPDATE node (global state)
- **Total Operations:** ~22 database queries
- **Latency:** ~0.5-1 second (depending on Neo4j hardware)

---

### Total Per-Event Requirements

| Stage | LLM Calls | Tokens | Latency | Parallelizable |
|-------|-----------|--------|---------|----------------|
| 1. Sensory Processing | 5 | 2,500 | 1-2s | Yes (5-way) |
| 2. Local Discrimination | 5 | 2,000 | 1-2s | Yes (5-way) |
| 3. Loki Integration | 1 | 1,500 | 2-3s | No |
| 4. Global Discrimination | 1 | 1,100 | 1.5-2s | No |
| 5. Database Storage | 0 | 0 | 0.5-1s | No |
| **TOTAL** | **12** | **7,100** | **6.5-10s** | Partial (10/12) |

**Note:** Token count reduced from initial estimate (10,400 → 7,100) through optimized prompts.

---

## Hardware Configuration Options

### Option 1: Single High-End GPU (Budget/Development)

**Target Use Case:** Research, prototyping, small-scale testing

#### **Hardware Specification:**

**GPU:**
- Model: NVIDIA RTX 4090
- VRAM: 24GB GDDR6X
- CUDA Cores: 16,384
- Tensor Cores: 512 (4th gen)
- Memory Bandwidth: 1,008 GB/s
- Price: ~$1,600

**CPU:**
- Model: AMD Ryzen 9 7950X or Intel i9-13900K
- Cores: 16 cores / 32 threads
- Base Clock: 4.5 GHz
- Price: ~$600

**RAM:**
- Capacity: 64GB DDR5
- Speed: 5600 MT/s
- ECC: Optional (recommended for production)
- Price: ~$200

**Storage:**
- Primary: 2TB NVMe Gen4 SSD (Neo4j database)
- Speed: 7,000 MB/s read
- Price: ~$150

**Total System Cost:** ~$2,550 (excluding case, PSU, motherboard ~$500 additional)

---

#### **LLM Configuration:**

**Model Selection:**
- Primary: **Llama-3.1-8B-Instruct** (quantized to 4-bit)
- VRAM Usage: ~4-5GB per instance
- Instances: 3 concurrent (workers, discriminators time-shared)

**Model Loading Strategy:**
```
GPU Memory Allocation:
├─ Model 1 (Sensory Workers): 5GB - shared across 5 workers (sequential)
├─ Model 2 (Discriminators): 5GB - shared across 5 discriminators (sequential)
├─ Model 3 (Loki Integration): 5GB
├─ Model 4 (Global Discriminator): 5GB
└─ Overhead (KV cache, etc.): 4GB
Total: ~24GB (fits in RTX 4090)
```

**Processing Mode:**
- **Sensory Workers (5 agents):** Sequential batching (5 calls × 0.3s = 1.5s)
- **Discriminators (5 agents):** Sequential batching (5 calls × 0.3s = 1.5s)
- **Loki:** Single call (~0.5s)
- **Global Disc:** Single call (~0.5s)
- **Total Pipeline:** ~4-5 seconds per event

---

#### **Performance Metrics:**

| Metric | Value |
|--------|-------|
| Throughput | 12-15 events/minute |
| Latency | 4-5 seconds per event |
| Token Throughput | ~1,420 tokens/minute |
| Power Consumption | ~450W (GPU) + 200W (system) = 650W |
| Operating Cost | $0.10/hour (electricity @ $0.15/kWh) |

---

#### **Advantages:**
✅ Low initial cost  
✅ Single machine simplicity  
✅ Good for development and testing  
✅ Can run 24/7 for continuous learning  

#### **Disadvantages:**
❌ Sequential processing (not truly parallel)  
❌ Limited to smaller models (8B parameters)  
❌ Single point of failure  
❌ Can't scale beyond ~15 events/minute  

---

### Option 2: Multi-GPU Parallel System (Recommended for Production)

**Target Use Case:** Production deployment, high throughput, research at scale

#### **Hardware Specification:**

**GPUs:**
- Count: 4× NVIDIA RTX 4090
- Total VRAM: 96GB (24GB each)
- Configuration: PCIe 4.0 ×16 per GPU
- Price: 4 × $1,600 = $6,400

**CPU:**
- Model: AMD Threadripper PRO 5975WX or Intel Xeon W-3375
- Cores: 32 cores / 64 threads
- PCIe Lanes: 128 lanes (supports 4 GPUs at ×16)
- Price: ~$3,500

**RAM:**
- Capacity: 256GB DDR4 ECC
- Speed: 3200 MT/s
- Configuration: 8× 32GB modules
- Price: ~$800

**Storage:**
- Primary: 2× 4TB NVMe Gen4 SSD (RAID 1 for Neo4j)
- Speed: 7,000 MB/s read
- Secondary: 8TB HDD (model checkpoints, backups)
- Price: ~$600

**Motherboard:**
- Chipset: TRX40 (AMD) or C621A (Intel)
- PCIe Slots: 4× PCIe 4.0 ×16
- Price: ~$800

**Power Supply:**
- Wattage: 2000W 80+ Platinum
- Redundancy: Single unit sufficient
- Price: ~$400

**Total System Cost:** ~$12,500

---

#### **LLM Configuration:**

**Model Distribution:**
```
GPU 1 (Sensory Workers):
├─ 5× Llama-3.1-8B-Instruct instances (4-bit quantized)
├─ VRAM: ~20GB (4GB per model)
└─ Process all 5 workers in parallel

GPU 2 (Local Discriminators):
├─ 5× Llama-3.1-8B-Instruct instances (4-bit quantized)
├─ VRAM: ~20GB (4GB per model)
└─ Process all 5 discriminators in parallel

GPU 3 (Loki Integration):
├─ 1× Llama-3.1-70B-Instruct (4-bit quantized)
├─ VRAM: ~35GB (requires model parallelism across 2 GPUs)
└─ Use GPU 3 + GPU 4 for tensor parallelism

GPU 4 (Global Discriminator + Loki overflow):
├─ Shared with GPU 3 for Loki 70B (tensor parallelism)
├─ Also runs Global Discriminator (8B model)
└─ VRAM: ~24GB total
```

**Alternative Configuration (All 8B models):**
```
GPU 1: 5× Workers (8B) - parallel
GPU 2: 5× Discriminators (8B) - parallel  
GPU 3: 1× Loki (8B) - sequential
GPU 4: 1× Global Disc (8B) - sequential
```

---

#### **Processing Mode (Parallel Pipeline):**

**Timeline (Optimized):**
```
t=0s:     Stage 1 starts (GPU 1: 5 workers in parallel)
t=0s:     (Workers processing sensory data...)
t=1s:     Stage 1 complete → outputs ready
t=1s:     Stage 2 starts (GPU 2: 5 discriminators in parallel)
t=1s:     (Discriminators classifying worker outputs...)
t=2s:     Stage 2 complete → feedback ready
t=2s:     Stage 3 starts (GPU 3+4: Loki 70B)
t=2s:     (Loki integrating + predicting...)
t=4s:     Stage 3 complete → integrated rep ready
t=4s:     Stage 4 starts (GPU 4: Global discriminator)
t=4s:     (Global disc assessing coherence...)
t=5s:     Stage 4 complete → coherence score ready
t=5s:     Stage 5 starts (Neo4j storage)
t=5s:     (Database writes...)
t=5.5s:   Stage 5 complete → Event processing done
```

**Total Latency:** ~5.5 seconds per event

---

#### **Performance Metrics:**

| Metric | Value |
|--------|-------|
| Throughput | 10-11 events/minute (limited by Loki inference) |
| Latency | 5.5 seconds per event |
| Token Throughput | ~1,290 tokens/minute |
| Parallel Efficiency | ~83% (10/12 agents parallelized) |
| Power Consumption | 4×450W (GPUs) + 400W (system) = 2,200W |
| Operating Cost | $0.33/hour (electricity @ $0.15/kWh) |

---

#### **Advantages:**
✅ True parallel processing (10 agents concurrent)  
✅ Can use larger models (70B for Loki)  
✅ Higher throughput (10-11 events/min)  
✅ Redundancy (GPU failure doesn't crash system)  
✅ Scalable (add more GPUs for more modalities)  

#### **Disadvantages:**
❌ High initial cost ($12,500)  
❌ High power consumption (2.2kW)  
❌ Requires workstation-class hardware (expensive motherboard/CPU)  
❌ Complex deployment (multi-GPU synchronization)  

---

### Option 3: Cloud Inference APIs (Lowest Barrier to Entry)

**Target Use Case:** Prototyping, demos, variable load, no hardware investment

#### **Service Options:**

**Option 3A: OpenAI GPT-4 API**
```
Model Selection:
├─ Workers (5×): GPT-4o-mini ($0.15/1M input tokens, $0.60/1M output)
├─ Discriminators (5×): GPT-4o-mini ($0.15/1M input tokens, $0.60/1M output)
├─ Loki (1×): GPT-4o ($2.50/1M input tokens, $10/1M output)
└─ Global Disc (1×): GPT-4o ($2.50/1M input tokens, $10/1M output)
```

**Option 3B: Anthropic Claude API**
```
Model Selection:
├─ Workers (5×): Claude-3-Haiku ($0.25/1M input, $1.25/1M output)
├─ Discriminators (5×): Claude-3-Haiku ($0.25/1M input, $1.25/1M output)
├─ Loki (1×): Claude-3.5-Sonnet ($3/1M input, $15/1M output)
└─ Global Disc (1×): Claude-3.5-Sonnet ($3/1M input, $15/1M output)
```

**Option 3C: Together.ai (Open Models)**
```
Model Selection:
├─ Workers (5×): Llama-3.1-8B ($0.18/1M tokens)
├─ Discriminators (5×): Llama-3.1-8B ($0.18/1M tokens)
├─ Loki (1×): Llama-3.1-70B ($0.88/1M tokens)
└─ Global Disc (1×): Llama-3.1-70B ($0.88/1M tokens)
```

---

#### **Cost Analysis (Per 1000 Events):**

**Option 3A: OpenAI GPT-4**

| Agent Type | Count | Input Tokens | Output Tokens | Cost per Call | Total per 1000 |
|------------|-------|--------------|---------------|---------------|----------------|
| Workers (4o-mini) | 5 | 300 | 200 | $0.000165 | $0.825 |
| Discriminators (4o-mini) | 5 | 250 | 150 | $0.000128 | $0.638 |
| Loki (4o) | 1 | 1000 | 500 | $0.0075 | $7.50 |
| Global Disc (4o) | 1 | 800 | 300 | $0.005 | $5.00 |
| **TOTAL** | **12** | | | **$0.0131** | **$13.96** |

**Effective Cost:** ~$0.014 per event

---

**Option 3B: Anthropic Claude**

| Agent Type | Count | Input Tokens | Output Tokens | Cost per Call | Total per 1000 |
|------------|-------|--------------|---------------|---------------|----------------|
| Workers (Haiku) | 5 | 300 | 200 | $0.000325 | $1.625 |
| Discriminators (Haiku) | 5 | 250 | 150 | $0.00025 | $1.25 |
| Loki (Sonnet) | 1 | 1000 | 500 | $0.0105 | $10.50 |
| Global Disc (Sonnet) | 1 | 800 | 300 | $0.0069 | $6.90 |
| **TOTAL** | **12** | | | **$0.0202** | **$20.28** |

**Effective Cost:** ~$0.020 per event

---

**Option 3C: Together.ai (Open Models)**

| Agent Type | Count | Tokens | Cost per Call | Total per 1000 |
|------------|-------|--------|---------------|----------------|
| Workers (8B) | 5 | 500 | $0.00009 | $0.45 |
| Discriminators (8B) | 5 | 400 | $0.000072 | $0.36 |
| Loki (70B) | 1 | 1500 | $0.00132 | $1.32 |
| Global Disc (70B) | 1 | 1100 | $0.000968 | $0.968 |
| **TOTAL** | **12** | **7,100** | **$0.00310** | **$3.10** |

**Effective Cost:** ~$0.003 per event

---

#### **Performance Metrics (Cloud APIs):**

| Metric | OpenAI | Anthropic | Together.ai |
|--------|--------|-----------|-------------|
| Throughput | 5-8 events/min* | 5-8 events/min* | 10-15 events/min |
| Latency | 6-10 seconds | 6-10 seconds | 4-6 seconds |
| Cost per Event | $0.014 | $0.020 | $0.003 |
| Cost per 1M events | $14,000 | $20,000 | $3,000 |
| Rate Limits | 500 RPM (GPT-4) | 50 RPM (Sonnet) | 100 RPM |

*Rate limit dependent

---

#### **Advantages:**
✅ Zero upfront hardware cost  
✅ Instant deployment (no setup)  
✅ Automatic scaling (cloud provider handles load)  
✅ Latest models (GPT-4, Claude-3.5)  
✅ High reliability (99.9% SLA)  
✅ Together.ai: Very cost-effective ($3/1000 events)  

#### **Disadvantages:**
❌ Ongoing costs (can exceed hardware cost at scale)  
❌ Rate limits (throttles throughput)  
❌ Network latency (200-500ms per call)  
❌ Data privacy concerns (external API)  
❌ No fine-tuning control  

---

### Option 4: Hybrid Local + Cloud (Best of Both Worlds)

**Target Use Case:** Production with quality/cost balance

#### **Configuration:**

**Local Hardware (Sensory Layer):**
- GPUs: 2× NVIDIA RTX 4090 (24GB each)
- Run: 5 Workers + 5 Discriminators (10 agents)
- Models: Llama-3.1-8B-Instruct (4-bit)
- Cost: ~$4,000 (2 GPUs + minimal CPU/RAM)

**Cloud API (Integration Layer):**
- Run: Loki + Global Discriminator (2 agents)
- Service: OpenAI GPT-4o or Anthropic Claude-3.5-Sonnet
- Cost per event: ~$0.0125 (only 2 API calls)

---

#### **Cost Analysis (Hybrid):**

**Hardware Costs (One-Time):**
- 2× RTX 4090: $3,200
- CPU + RAM + Storage: $800
- **Total Upfront:** $4,000

**Operating Costs:**
- Electricity: 1,100W × $0.15/kWh × 730 hours/month = $120/month
- Cloud API: 2 calls × $0.00625 per call = $0.0125 per event
  * At 1,000 events/month: $12.50/month
  * At 10,000 events/month: $125/month
  * At 100,000 events/month: $1,250/month

**Total Monthly Cost:**
- 1K events: $120 + $12.50 = **$132.50/month**
- 10K events: $120 + $125 = **$245/month**
- 100K events: $120 + $1,250 = **$1,370/month**

**Break-Even Analysis (vs. Pure Cloud):**
- Pure cloud cost at 10K events: $140/month (Together.ai) or $200/month (Claude)
- Hybrid cost at 10K events: $245/month
- **Advantage:** Better quality (GPT-4 for critical agents) at moderate cost

---

#### **Performance Metrics:**

| Metric | Value |
|--------|-------|
| Throughput | 8-10 events/minute |
| Latency | 5-7 seconds per event |
| Local Processing | 3 seconds (workers + discriminators) |
| Cloud Processing | 2-3 seconds (Loki + global disc) |
| Network Overhead | ~0.5 seconds (API latency) |
| Cost Efficiency | High (cheap local + smart cloud) |

---

#### **Advantages:**
✅ Best quality/cost ratio  
✅ Local processing for high-volume tasks (workers)  
✅ Cloud intelligence for critical tasks (Loki)  
✅ Scalable (add GPUs or increase API calls)  
✅ Data privacy (sensory data stays local)  
✅ Redundancy (local failure → cloud fallback)  

#### **Disadvantages:**
❌ Hybrid complexity (two deployment environments)  
❌ Network dependency (cloud API required)  
❌ Still requires hardware investment ($4K)  

---

## Neo4j Database Requirements

### Storage Requirements

**Per-Event Data:**
```
Nodes Created:
├─ 5× Sensory Representation Nodes (~1KB each) = 5KB
├─ 1× Integrated Representation Node (~2KB) = 2KB
├─ 5× Discriminator Score Nodes (~0.5KB each) = 2.5KB
├─ 1× Global Coherence Score Node (~0.5KB) = 0.5KB
└─ Total Nodes: 12 nodes, ~10KB data

Relationships Created:
├─ 5× Worker → Integrated Rep (contains) = 5 edges
├─ 5× Discriminator → Worker (evaluates) = 5 edges
├─ 1× Global Disc → Integrated Rep (assesses) = 1 edge
├─ 1× Integrated Rep → Episode (part_of) = 1 edge
└─ Total Edges: ~12 edges, ~2KB metadata

Total per Event: ~12KB (nodes + edges + indexes)
```

---

### Scale Analysis

| Event Count | Data Size | Index Size | Total Storage | Query Time |
|-------------|-----------|------------|---------------|------------|
| 1,000 | 12 MB | 24 MB | 36 MB | < 10ms |
| 10,000 | 120 MB | 240 MB | 360 MB | < 20ms |
| 100,000 | 1.2 GB | 2.4 GB | 3.6 GB | < 50ms |
| 1,000,000 | 12 GB | 24 GB | 36 GB | < 100ms |
| 10,000,000 | 120 GB | 240 GB | 360 GB | < 200ms |

---

### Hardware Recommendations

**For < 100K Events (Development):**
- RAM: 8GB allocated to Neo4j
- Storage: 100GB SSD
- CPU: 4 cores
- **Cost:** Included in main system

**For 100K-1M Events (Small Production):**
- RAM: 32GB allocated to Neo4j
- Storage: 500GB NVMe SSD
- CPU: 8 cores
- **Cost:** ~$500 additional

**For 1M-10M Events (Large Production):**
- RAM: 128GB allocated to Neo4j
- Storage: 2TB NVMe SSD (RAID 1)
- CPU: 16 cores
- **Cost:** ~$2,000 additional

**For > 10M Events (Enterprise):**
- RAM: 256GB ECC RAM
- Storage: 4TB NVMe SSD (RAID 10)
- CPU: 32 cores
- Replication: Multi-node cluster (3+ nodes)
- **Cost:** ~$10,000 additional

---

## Deployment Configurations

### Configuration A: Development (Single Workstation)

**Hardware:**
- 1× RTX 4090 (24GB)
- 16-core CPU
- 64GB RAM
- 2TB SSD

**Software:**
- LLM: Llama-3.1-8B (local, 4-bit)
- Neo4j: Community Edition (local)
- Orchestration: Python + FastAPI

**Capacity:**
- 12-15 events/minute
- < 100K events stored
- Single user

**Cost:**
- Hardware: ~$3,000
- Electricity: ~$80/month
- **Total:** $3,000 + $80/month

---

### Configuration B: Small Production (Multi-GPU Workstation)

**Hardware:**
- 2× RTX 4090 (48GB total)
- 32-core CPU
- 128GB RAM
- 4TB SSD (RAID 1)

**Software:**
- LLM: Llama-3.1-8B + Llama-3.1-70B (local)
- Neo4j: Enterprise Edition (local)
- Orchestration: Docker + Kubernetes (single node)
- Monitoring: Prometheus + Grafana

**Capacity:**
- 8-10 events/minute
- 100K-1M events stored
- 5-10 concurrent users

**Cost:**
- Hardware: ~$8,000
- Software: Neo4j Enterprise ($1,500/year)
- Electricity: ~$150/month
- **Total:** $8,000 + $1,500/year + $150/month

---

### Configuration C: Large Production (Multi-Node Cluster)

**Hardware (per node, 3 nodes minimum):**
- 4× RTX 4090 (96GB VRAM)
- 64-core CPU
- 256GB ECC RAM
- 8TB SSD (RAID 10)

**Total Cluster:**
- 12 GPUs (3 nodes × 4 GPUs)
- 192 cores total
- 768GB RAM total
- 24TB storage

**Software:**
- LLM: Distributed inference (vLLM, DeepSpeed)
- Neo4j: Causal Cluster (3 core + 2 read replicas)
- Orchestration: Kubernetes (multi-node)
- Load Balancing: NGINX + HAProxy
- Monitoring: Full observability stack

**Capacity:**
- 30-40 events/minute (parallel across nodes)
- 10M+ events stored
- 100+ concurrent users
- 99.9% uptime SLA

**Cost:**
- Hardware: 3× $12,500 = $37,500
- Software: Neo4j Enterprise ($10,000/year)
- Colocation: $2,000/month (power + cooling + network)
- **Total:** $37,500 + $10,000/year + $2,000/month

---

### Configuration D: Cloud Hybrid (Scalable)

**Architecture:**
```
Cloud Provider: AWS or GCP

GPU Instances (Sensory Layer):
├─ 2× g5.2xlarge (1× A10G GPU each)
├─ $1.21/hour × 2 = $2.42/hour
└─ Run workers + discriminators

API Calls (Integration Layer):
├─ OpenAI GPT-4 API (Loki + Global Disc)
├─ $0.0125 per event
└─ Variable cost based on load

Neo4j Database:
├─ Neo4j AuraDB Professional
├─ $0.75/hour (8GB RAM, 3 vCPU)
└─ Managed, auto-scaling
```

**Capacity:**
- 8-10 events/minute
- Unlimited storage (pay-as-you-grow)
- Auto-scaling

**Cost (24/7 operation):**
- GPU instances: $2.42/hour × 730 hours = $1,767/month
- Neo4j AuraDB: $0.75/hour × 730 hours = $547/month
- API calls: $0.0125 per event
  * At 10K events/month: $125/month
  * At 100K events/month: $1,250/month
- **Total (10K events):** $1,767 + $547 + $125 = **$2,439/month**
- **Total (100K events):** $1,767 + $547 + $1,250 = **$3,564/month**

**Cost (8-hour workday operation):**
- GPU instances: $2.42/hour × 8 hours × 22 days = $426/month
- Neo4j AuraDB: $0.75/hour × 8 hours × 22 days = $132/month
- API calls: Same as above
- **Total (10K events):** $426 + $132 + $125 = **$683/month**

---

## Recommendations by Use Case

### For Research/Academic Use:
**Recommended:** Configuration A (Dev Workstation) or Cloud API (Together.ai)
- Minimal investment
- Sufficient for papers, experiments
- Cost: $3,000 upfront or $0.003/event cloud

---

### For Startup/Prototype:
**Recommended:** Cloud Hybrid (Option 4)
- Low upfront cost ($4,000 local GPUs)
- Scalable with demand
- Best quality/cost ratio
- Cost: $4,000 + $250-500/month

---

### For Small Business:
**Recommended:** Configuration B (Multi-GPU Workstation)
- Fixed costs (predictable budget)
- Good throughput (8-10 events/min)
- No ongoing API costs
- Cost: $8,000 + $1,500/year + $150/month

---

### For Enterprise:
**Recommended:** Configuration C (Multi-Node Cluster)
- High throughput (30-40 events/min)
- High availability (99.9% uptime)
- Scales to millions of events
- Cost: $37,500 + $10,000/year + $2,000/month

---

## Power Consumption & Environmental Impact

### Single RTX 4090 System (Configuration A):
- GPU: 450W (max TGP)
- CPU: 200W
- Other: 100W
- **Total: 750W peak, ~500W average**

**Annual Impact:**
- Energy: 500W × 8,760 hours = 4,380 kWh/year
- CO₂ (US avg): 4,380 kWh × 0.42 kg/kWh = 1,840 kg CO₂/year
- Cost: 4,380 kWh × $0.15 = $657/year

---

### 4× RTX 4090 System (Configuration B):
- GPUs: 1,800W (4× 450W)
- CPU: 400W
- Other: 200W
- **Total: 2,400W peak, ~1,600W average**

**Annual Impact:**
- Energy: 1,600W × 8,760 hours = 14,016 kWh/year
- CO₂ (US avg): 14,016 kWh × 0.42 kg/kWh = 5,887 kg CO₂/year
- Cost: 14,016 kWh × $0.15 = $2,102/year

---

### Cloud vs. Local Environmental Comparison:

**Local (Configuration B):**
- 14,016 kWh/year
- 5,887 kg CO₂/year

**Cloud (AWS g5.2xlarge ×2, 24/7):**
- AWS PUE: ~1.2 (power usage effectiveness)
- Actual energy: ~16,800 kWh/year
- AWS renewable: ~65% renewable energy
- Effective CO₂: 16,800 × 0.35 × 0.42 = 2,469 kg CO₂/year

**Winner:** Cloud has ~58% lower carbon footprint (due to renewable energy + efficiency)

---

## Optimization Strategies

### Token Reduction Techniques:

1. **Prompt Caching:**
   - Cache system prompts (unchanging parts)
   - Reduces input tokens by 30-50%
   - Supported by: OpenAI, Anthropic

2. **Embedding Compression:**
   - Use vector embeddings instead of full text
   - Reduces sensory representation size by 90%

3. **Batching:**
   - Process multiple events in single call
   - Amortizes prompt overhead

4. **Fine-Tuning:**
   - Fine-tune smaller models on OA-Loki task
   - Reduces need for large context

**Potential Savings:** 30-60% token reduction → proportional cost reduction

---

### Hardware Optimization:

1. **Model Quantization:**
   - 4-bit GPTQ or AWQ quantization
   - Reduces VRAM by 75% (16-bit → 4-bit)
   - Minimal quality loss (< 2%)

2. **Flash Attention:**
   - Reduces memory usage during inference
   - 2-3× speedup on long contexts

3. **vLLM Framework:**
   - PagedAttention for efficient KV cache
   - Continuous batching for higher throughput

**Potential Savings:** 2-3× higher throughput per GPU

---

## Conclusion

**Recommended Starting Configuration:**
- **Development/Research:** Cloud API (Together.ai) - $0.003/event
- **Production (< 10K events/month):** Hybrid Local + Cloud - $4K + $250/month
- **Production (> 100K events/month):** Multi-GPU Workstation - $8K + $150/month
- **Enterprise (> 1M events/month):** Multi-Node Cluster - $37K + $2K/month

**Key Takeaway:** The system is computationally intensive (12 LLM calls per event) but feasible with modern hardware or cloud APIs. Choice depends on scale, budget, and latency requirements.

---

**Document Version:** 1.0.0  
**Last Updated:** November 10, 2025  
**Maintained By:** Mimir Development Team
