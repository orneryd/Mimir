# Architecture

**System design and internal architecture of NornicDB.**

## 📚 Documentation

- **[System Design](system-design.md)** - High-level architecture overview
- **[Replication](replication.md)** - Clustering and replication internals
- **[Plugin System](plugin-system.md)** - Extensibility architecture
- **[Norns Mythology](norns-mythology.md)** - Project naming and philosophy

## 🏗️ Core Components

### Storage Layer
- Badger KV store for persistence
- In-memory engine for testing
- Property graph model
- ACID transactions

### Query Engine
- Cypher parser and planner
- Query optimizer
- Execution engine
- Result streaming

### Index System
- HNSW vector index
- B-tree property index
- Full-text BM25 index
- Automatic index selection

### Replication
- Hot Standby (2-node HA)
- Raft Consensus (3+ node strong consistency)
- Multi-Region (geographic distribution)
- WAL streaming and failover

### GPU Acceleration
- Multi-backend support (Metal, CUDA, OpenCL)
- Automatic CPU fallback
- Memory-optimized operations
- Batch processing

## 📖 Learn More

- **[System Design](system-design.md)** - Complete architecture
- **[Replication](replication.md)** - Clustering internals
- **[Clustering Guide](../user-guides/clustering.md)** - User documentation
- **[Performance](../performance/)** - Benchmarks and optimization
- **[Development](../development/)** - Contributing guide

---

**Dive deeper** → **[System Design](system-design.md)**
