# NornicDB Clustering Guide

This guide covers how to set up, configure, and operate NornicDB in clustered configurations for high availability and scalability.

## Table of Contents

1. [Overview](#overview)
2. [Choosing a Replication Mode](#choosing-a-replication-mode)
3. [Mode 1: Hot Standby (2 Nodes)](#mode-1-hot-standby-2-nodes)
4. [Mode 2: Raft Cluster (3+ Nodes)](#mode-2-raft-cluster-3-nodes)
5. [Mode 3: Multi-Region](#mode-3-multi-region)
6. [Client Connection](#client-connection)
7. [Monitoring & Health Checks](#monitoring--health-checks)
8. [Failover Operations](#failover-operations)
9. [Troubleshooting](#troubleshooting)

---

## Overview

NornicDB supports multiple replication modes to meet different availability and consistency requirements:

| Mode             | Nodes | Consistency  | Use Case                               |
| ---------------- | ----- | ------------ | -------------------------------------- |
| **Standalone**   | 1     | N/A          | Development, testing, small workloads  |
| **Hot Standby**  | 2     | Eventual     | Simple HA, fast failover               |
| **Raft Cluster** | 3-5   | Strong       | Production HA, consistent reads        |
| **Multi-Region** | 6+    | Configurable | Global distribution, disaster recovery |

### Architecture Diagram

```
MODE 1: HOT STANDBY (2 nodes)
┌─────────────┐      WAL Stream      ┌─────────────┐
│   Primary   │ ──────────────────►  │   Standby   │
│  (writes)   │      (async/sync)    │  (failover) │
└─────────────┘                      └─────────────┘

MODE 2: RAFT CLUSTER (3-5 nodes)
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Leader    │◄──►│  Follower   │◄──►│  Follower   │
│  (writes)   │    │  (reads)    │    │  (reads)    │
└─────────────┘    └─────────────┘    └─────────────┘
        │                  │                  │
        └──────────────────┴──────────────────┘
                   Raft Consensus

MODE 3: MULTI-REGION (Raft clusters + cross-region HA)
┌─────────────────────────┐      ┌─────────────────────────┐
│      US-EAST REGION     │      │      EU-WEST REGION     │
│  ┌───┐ ┌───┐ ┌───┐     │ WAL  │     ┌───┐ ┌───┐ ┌───┐  │
│  │ L │ │ F │ │ F │     │◄────►│     │ L │ │ F │ │ F │  │
│  └───┘ └───┘ └───┘     │async │     └───┘ └───┘ └───┘  │
│     Raft Cluster A      │      │      Raft Cluster B    │
└─────────────────────────┘      └─────────────────────────┘
```

---

## Choosing a Replication Mode

### Hot Standby (2 nodes)

**Choose this when:**

- You need simple, fast failover
- You have exactly 2 nodes available
- Eventual consistency is acceptable
- You want minimal operational complexity

**Trade-offs:**

- ✅ Simple setup and operation
- ✅ Fast failover (~1-5 seconds)
- ✅ Low resource overhead
- ⚠️ Only 2 nodes (no quorum)
- ⚠️ Risk of data loss on async failover

### Raft Cluster (3-5 nodes)

**Choose this when:**

- You need strong consistency guarantees
- You want automatic leader election
- You can deploy 3+ nodes
- Data integrity is critical

**Trade-offs:**

- ✅ Strong consistency (linearizable)
- ✅ Automatic leader election
- ✅ No data loss on failover
- ⚠️ Higher latency (quorum writes)
- ⚠️ Requires odd number of nodes

### Multi-Region (6+ nodes)

**Choose this when:**

- You need geographic distribution
- You want disaster recovery across regions
- You have users in multiple geographic areas
- You can tolerate cross-region latency

**Trade-offs:**

- ✅ Geographic redundancy
- ✅ Local read performance
- ✅ Disaster recovery
- ⚠️ Complex setup
- ⚠️ Cross-region latency for writes

---

## Mode 1: Hot Standby (2 Nodes)

Hot Standby provides simple high availability with one primary node handling all writes and one standby node receiving replicated data.

### Configuration Overview

| Variable                            | Primary        | Standby        | Description            |
| ----------------------------------- | -------------- | -------------- | ---------------------- |
| `NORNICDB_CLUSTER_MODE`             | `ha_standby`   | `ha_standby`   | Replication mode       |
| `NORNICDB_CLUSTER_NODE_ID`          | `primary-1`    | `standby-1`    | Unique node identifier |
| `NORNICDB_CLUSTER_HA_ROLE`          | `primary`      | `standby`      | Node role              |
| `NORNICDB_CLUSTER_HA_PEER_ADDR`     | `standby:7688` | `primary:7688` | Peer address           |
| `NORNICDB_CLUSTER_HA_AUTO_FAILOVER` | `true`         | `true`         | Enable auto-failover   |

### Docker Compose Setup

Create a `docker-compose.ha.yml`:

```yaml
version: "3.8"

services:
  nornicdb-primary:
    image: nornicdb:latest
    container_name: nornicdb-primary
    hostname: primary
    ports:
      - "7474:7474" # HTTP API
      - "7687:7687" # Bolt protocol
    volumes:
      - primary-data:/data
    environment:
      # Cluster Configuration
      NORNICDB_CLUSTER_MODE: ha_standby
      NORNICDB_CLUSTER_NODE_ID: primary-1
      NORNICDB_CLUSTER_BIND_ADDR: 0.0.0.0:7688

      # HA Standby Configuration
      NORNICDB_CLUSTER_HA_ROLE: primary
      NORNICDB_CLUSTER_HA_PEER_ADDR: standby:7688
      NORNICDB_CLUSTER_HA_SYNC_MODE: semi_sync
      NORNICDB_CLUSTER_HA_HEARTBEAT_MS: 1000
      NORNICDB_CLUSTER_HA_FAILOVER_TIMEOUT: 30s
      NORNICDB_CLUSTER_HA_AUTO_FAILOVER: "true"
    networks:
      - nornicdb-cluster
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:7474/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  nornicdb-standby:
    image: nornicdb:latest
    container_name: nornicdb-standby
    hostname: standby
    ports:
      - "7475:7474" # HTTP API (different port)
      - "7688:7687" # Bolt protocol (different port)
    volumes:
      - standby-data:/data
    environment:
      # Cluster Configuration
      NORNICDB_CLUSTER_MODE: ha_standby
      NORNICDB_CLUSTER_NODE_ID: standby-1
      NORNICDB_CLUSTER_BIND_ADDR: 0.0.0.0:7688

      # HA Standby Configuration
      NORNICDB_CLUSTER_HA_ROLE: standby
      NORNICDB_CLUSTER_HA_PEER_ADDR: primary:7688
      NORNICDB_CLUSTER_HA_SYNC_MODE: semi_sync
      NORNICDB_CLUSTER_HA_HEARTBEAT_MS: 1000
      NORNICDB_CLUSTER_HA_FAILOVER_TIMEOUT: 30s
      NORNICDB_CLUSTER_HA_AUTO_FAILOVER: "true"
    networks:
      - nornicdb-cluster
    depends_on:
      - nornicdb-primary
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:7474/health"]
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  primary-data:
  standby-data:

networks:
  nornicdb-cluster:
    driver: bridge
```

### Starting the Cluster

```bash
# Start the HA cluster
docker compose -f docker-compose.ha.yml up -d

# Check status
docker compose -f docker-compose.ha.yml ps

# View logs
docker compose -f docker-compose.ha.yml logs -f
```

### Sync Modes

| Mode        | Description                 | Latency | Data Safety       |
| ----------- | --------------------------- | ------- | ----------------- |
| `async`     | Acknowledge immediately     | Lowest  | Risk of data loss |
| `semi_sync` | Wait for standby to receive | Medium  | Minimal data loss |
| `sync`      | Wait for standby to persist | Highest | No data loss      |

### Manual Failover

```bash
# Trigger manual failover (run on standby)
curl -X POST http://localhost:7475/admin/promote

# Or via environment variable on restart
NORNICDB_CLUSTER_HA_ROLE=primary
```

---

## Mode 2: Raft Cluster (3+ Nodes)

Raft provides strong consistency with automatic leader election. All writes go through the elected leader and are replicated to followers before acknowledgment.

### Configuration Overview

| Variable                          | Node 1    | Node 2    | Node 3    | Description       |
| --------------------------------- | --------- | --------- | --------- | ----------------- |
| `NORNICDB_CLUSTER_MODE`           | `raft`    | `raft`    | `raft`    | Replication mode  |
| `NORNICDB_CLUSTER_NODE_ID`        | `node-1`  | `node-2`  | `node-3`  | Unique node ID    |
| `NORNICDB_CLUSTER_RAFT_BOOTSTRAP` | `true`    | `false`   | `false`   | Bootstrap cluster |
| `NORNICDB_CLUSTER_RAFT_PEERS`     | See below | See below | See below | Peer addresses    |

### Docker Compose Setup

Create a `docker-compose.raft.yml`:

```yaml
version: "3.8"

services:
  nornicdb-node1:
    image: nornicdb:latest
    container_name: nornicdb-node1
    hostname: node1
    ports:
      - "7474:7474" # HTTP API
      - "7687:7687" # Bolt protocol
    volumes:
      - node1-data:/data
    environment:
      # Cluster Configuration
      NORNICDB_CLUSTER_MODE: raft
      NORNICDB_CLUSTER_NODE_ID: node-1
      NORNICDB_CLUSTER_BIND_ADDR: 0.0.0.0:7688
      NORNICDB_CLUSTER_ADVERTISE_ADDR: node1:7688

      # Raft Configuration
      NORNICDB_CLUSTER_RAFT_CLUSTER_ID: my-cluster
      NORNICDB_CLUSTER_RAFT_BOOTSTRAP: "true"
      NORNICDB_CLUSTER_RAFT_PEERS: "node-2:node2:7688,node-3:node3:7688"
      NORNICDB_CLUSTER_RAFT_ELECTION_TIMEOUT: 1s
      NORNICDB_CLUSTER_RAFT_HEARTBEAT_TIMEOUT: 100ms
      NORNICDB_CLUSTER_RAFT_SNAPSHOT_INTERVAL: 300
      NORNICDB_CLUSTER_RAFT_SNAPSHOT_THRESHOLD: 10000
    networks:
      - nornicdb-cluster
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:7474/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  nornicdb-node2:
    image: nornicdb:latest
    container_name: nornicdb-node2
    hostname: node2
    ports:
      - "7475:7474"
      - "7688:7687"
    volumes:
      - node2-data:/data
    environment:
      NORNICDB_CLUSTER_MODE: raft
      NORNICDB_CLUSTER_NODE_ID: node-2
      NORNICDB_CLUSTER_BIND_ADDR: 0.0.0.0:7688
      NORNICDB_CLUSTER_ADVERTISE_ADDR: node2:7688

      NORNICDB_CLUSTER_RAFT_CLUSTER_ID: my-cluster
      NORNICDB_CLUSTER_RAFT_BOOTSTRAP: "false"
      NORNICDB_CLUSTER_RAFT_PEERS: "node-1:node1:7688,node-3:node3:7688"
      NORNICDB_CLUSTER_RAFT_ELECTION_TIMEOUT: 1s
      NORNICDB_CLUSTER_RAFT_HEARTBEAT_TIMEOUT: 100ms
    networks:
      - nornicdb-cluster
    depends_on:
      - nornicdb-node1

  nornicdb-node3:
    image: nornicdb:latest
    container_name: nornicdb-node3
    hostname: node3
    ports:
      - "7476:7474"
      - "7689:7687"
    volumes:
      - node3-data:/data
    environment:
      NORNICDB_CLUSTER_MODE: raft
      NORNICDB_CLUSTER_NODE_ID: node-3
      NORNICDB_CLUSTER_BIND_ADDR: 0.0.0.0:7688
      NORNICDB_CLUSTER_ADVERTISE_ADDR: node3:7688

      NORNICDB_CLUSTER_RAFT_CLUSTER_ID: my-cluster
      NORNICDB_CLUSTER_RAFT_BOOTSTRAP: "false"
      NORNICDB_CLUSTER_RAFT_PEERS: "node-1:node1:7688,node-2:node2:7688"
      NORNICDB_CLUSTER_RAFT_ELECTION_TIMEOUT: 1s
      NORNICDB_CLUSTER_RAFT_HEARTBEAT_TIMEOUT: 100ms
    networks:
      - nornicdb-cluster
    depends_on:
      - nornicdb-node1

volumes:
  node1-data:
  node2-data:
  node3-data:

networks:
  nornicdb-cluster:
    driver: bridge
```

### Starting the Cluster

```bash
# Start the Raft cluster
docker compose -f docker-compose.raft.yml up -d

# Wait for leader election (typically 1-5 seconds)
sleep 5

# Check cluster status
curl http://localhost:7474/admin/cluster/status
```

### Raft Tuning Parameters

| Parameter                 | Default | Description                   |
| ------------------------- | ------- | ----------------------------- |
| `RAFT_ELECTION_TIMEOUT`   | `1s`    | Time before starting election |
| `RAFT_HEARTBEAT_TIMEOUT`  | `100ms` | Leader heartbeat interval     |
| `RAFT_SNAPSHOT_INTERVAL`  | `300`   | Seconds between snapshots     |
| `RAFT_SNAPSHOT_THRESHOLD` | `10000` | Log entries before snapshot   |
| `RAFT_TRAILING_LOGS`      | `10000` | Logs to retain after snapshot |
| `RAFT_MAX_APPEND_ENTRIES` | `64`    | Max entries per AppendEntries |

### Adding/Removing Nodes

```bash
# Add a new voter node (run on leader)
curl -X POST http://localhost:7474/admin/cluster/add \
  -H "Content-Type: application/json" \
  -d '{"node_id": "node-4", "address": "node4:7688"}'

# Remove a node (run on leader)
curl -X POST http://localhost:7474/admin/cluster/remove \
  -H "Content-Type: application/json" \
  -d '{"node_id": "node-4"}'
```

---

## Mode 3: Multi-Region

Multi-Region deployment combines Raft clusters within each region with asynchronous replication between regions.

### Configuration Overview

| Variable                          | US-East                       | EU-West                       | Description       |
| --------------------------------- | ----------------------------- | ----------------------------- | ----------------- |
| `NORNICDB_CLUSTER_MODE`           | `multi_region`                | `multi_region`                | Replication mode  |
| `NORNICDB_CLUSTER_REGION_ID`      | `us-east`                     | `eu-west`                     | Region identifier |
| `NORNICDB_CLUSTER_REMOTE_REGIONS` | `eu-west:eu-coordinator:7688` | `us-east:us-coordinator:7688` | Remote regions    |

### Docker Compose Setup (US-East Region)

Create `docker-compose.us-east.yml`:

```yaml
version: "3.8"

services:
  # US-East Raft Cluster (3 nodes)
  us-east-node1:
    image: nornicdb:latest
    container_name: us-east-node1
    hostname: us-east-node1
    ports:
      - "7474:7474"
      - "7687:7687"
    volumes:
      - us-east-node1-data:/data
    environment:
      # Multi-Region Configuration
      NORNICDB_CLUSTER_MODE: multi_region
      NORNICDB_CLUSTER_NODE_ID: us-east-node-1
      NORNICDB_CLUSTER_BIND_ADDR: 0.0.0.0:7688
      NORNICDB_CLUSTER_ADVERTISE_ADDR: us-east-node1:7688

      # Region Configuration
      NORNICDB_CLUSTER_REGION_ID: us-east
      NORNICDB_CLUSTER_REMOTE_REGIONS: "eu-west:eu-west-node1:7688"
      NORNICDB_CLUSTER_CROSS_REGION_MODE: async
      NORNICDB_CLUSTER_CONFLICT_STRATEGY: last_write_wins

      # Local Raft Configuration
      NORNICDB_CLUSTER_RAFT_CLUSTER_ID: us-east-cluster
      NORNICDB_CLUSTER_RAFT_BOOTSTRAP: "true"
      NORNICDB_CLUSTER_RAFT_PEERS: "us-east-node-2:us-east-node2:7688,us-east-node-3:us-east-node3:7688"
    networks:
      - nornicdb-global

  us-east-node2:
    image: nornicdb:latest
    container_name: us-east-node2
    hostname: us-east-node2
    ports:
      - "7475:7474"
      - "7688:7687"
    volumes:
      - us-east-node2-data:/data
    environment:
      NORNICDB_CLUSTER_MODE: multi_region
      NORNICDB_CLUSTER_NODE_ID: us-east-node-2
      NORNICDB_CLUSTER_BIND_ADDR: 0.0.0.0:7688
      NORNICDB_CLUSTER_ADVERTISE_ADDR: us-east-node2:7688
      NORNICDB_CLUSTER_REGION_ID: us-east
      NORNICDB_CLUSTER_REMOTE_REGIONS: "eu-west:eu-west-node1:7688"
      NORNICDB_CLUSTER_RAFT_CLUSTER_ID: us-east-cluster
      NORNICDB_CLUSTER_RAFT_BOOTSTRAP: "false"
      NORNICDB_CLUSTER_RAFT_PEERS: "us-east-node-1:us-east-node1:7688,us-east-node-3:us-east-node3:7688"
    networks:
      - nornicdb-global
    depends_on:
      - us-east-node1

  us-east-node3:
    image: nornicdb:latest
    container_name: us-east-node3
    hostname: us-east-node3
    ports:
      - "7476:7474"
      - "7689:7687"
    volumes:
      - us-east-node3-data:/data
    environment:
      NORNICDB_CLUSTER_MODE: multi_region
      NORNICDB_CLUSTER_NODE_ID: us-east-node-3
      NORNICDB_CLUSTER_BIND_ADDR: 0.0.0.0:7688
      NORNICDB_CLUSTER_ADVERTISE_ADDR: us-east-node3:7688
      NORNICDB_CLUSTER_REGION_ID: us-east
      NORNICDB_CLUSTER_REMOTE_REGIONS: "eu-west:eu-west-node1:7688"
      NORNICDB_CLUSTER_RAFT_CLUSTER_ID: us-east-cluster
      NORNICDB_CLUSTER_RAFT_BOOTSTRAP: "false"
      NORNICDB_CLUSTER_RAFT_PEERS: "us-east-node-1:us-east-node1:7688,us-east-node-2:us-east-node2:7688"
    networks:
      - nornicdb-global
    depends_on:
      - us-east-node1

volumes:
  us-east-node1-data:
  us-east-node2-data:
  us-east-node3-data:

networks:
  nornicdb-global:
    driver: bridge
```

### Cross-Region Replication Modes

| Mode        | Description                    | Latency | Consistency |
| ----------- | ------------------------------ | ------- | ----------- |
| `async`     | Fire-and-forget replication    | Lowest  | Eventual    |
| `semi_sync` | Wait for remote acknowledgment | Higher  | Stronger    |

### Conflict Resolution Strategies

| Strategy          | Description               | Use Case          |
| ----------------- | ------------------------- | ----------------- |
| `last_write_wins` | Latest timestamp wins     | Most applications |
| `manual`          | Require manual resolution | Financial data    |

---

## Client Connection

### Connecting to Hot Standby

```javascript
// Node.js with neo4j-driver
const neo4j = require("neo4j-driver");

// Connect to primary for writes
const primaryDriver = neo4j.driver(
  "bolt://localhost:7687",
  neo4j.auth.basic("admin", "admin")
);

// Connect to standby for reads (optional)
const standbyDriver = neo4j.driver(
  "bolt://localhost:7688",
  neo4j.auth.basic("admin", "admin")
);

// For high availability, use routing driver
const haDriver = neo4j.driver(
  "bolt://localhost:7687",
  neo4j.auth.basic("admin", "admin"),
  {
    resolver: (address) => [
      "localhost:7687", // Primary
      "localhost:7688", // Standby
    ],
  }
);
```

### Connecting to Raft Cluster

```javascript
// Node.js with neo4j-driver
const neo4j = require("neo4j-driver");

// Use routing driver for automatic leader discovery
const driver = neo4j.driver(
  "bolt://localhost:7687",
  neo4j.auth.basic("admin", "admin"),
  {
    resolver: (address) => [
      "localhost:7687", // Node 1
      "localhost:7688", // Node 2
      "localhost:7689", // Node 3
    ],
  }
);

// Writes automatically route to leader
const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
await session.run("CREATE (n:Person {name: $name})", { name: "Alice" });

// Reads can go to any node
const readSession = driver.session({ defaultAccessMode: neo4j.session.READ });
const result = await readSession.run("MATCH (n:Person) RETURN n");
```

### Connecting to Multi-Region

```javascript
// Connect to nearest region
const usEastDriver = neo4j.driver(
  "bolt://us-east-node1:7687",
  neo4j.auth.basic("admin", "admin"),
  {
    resolver: (address) => [
      "us-east-node1:7687",
      "us-east-node2:7687",
      "us-east-node3:7687",
    ],
  }
);

// For cross-region failover
const globalDriver = neo4j.driver(
  "bolt://us-east-node1:7687",
  neo4j.auth.basic("admin", "admin"),
  {
    resolver: (address) => [
      // Primary region
      "us-east-node1:7687",
      "us-east-node2:7687",
      "us-east-node3:7687",
      // Failover region
      "eu-west-node1:7687",
      "eu-west-node2:7687",
      "eu-west-node3:7687",
    ],
  }
);
```

### Python Connection

```python
from neo4j import GraphDatabase

# Hot Standby / Raft
driver = GraphDatabase.driver(
    "bolt://localhost:7687",
    auth=("admin", "admin"),
    resolver=lambda _: [
        ("localhost", 7687),
        ("localhost", 7688),
        ("localhost", 7689)
    ]
)

with driver.session() as session:
    result = session.run("MATCH (n) RETURN count(n)")
    print(result.single()[0])
```

---

## Monitoring & Health Checks

### Health Endpoint

```bash
# Check node health
curl http://localhost:7474/health

# Example response
{
  "status": "healthy",
  "replication": {
    "mode": "raft",
    "node_id": "node-1",
    "role": "leader",
    "is_leader": true,
    "state": "ready",
    "commit_index": 12345,
    "applied_index": 12345,
    "peers": [
      {"id": "node-2", "address": "node2:7688", "healthy": true},
      {"id": "node-3", "address": "node3:7688", "healthy": true}
    ]
  }
}
```

### Cluster Status Endpoint

```bash
# Get cluster status (Raft/Multi-Region)
curl http://localhost:7474/admin/cluster/status

# Example response
{
  "cluster_id": "my-cluster",
  "mode": "raft",
  "leader": {
    "id": "node-1",
    "address": "node1:7688"
  },
  "members": [
    {"id": "node-1", "address": "node1:7688", "state": "leader", "healthy": true},
    {"id": "node-2", "address": "node2:7688", "state": "follower", "healthy": true},
    {"id": "node-3", "address": "node3:7688", "state": "follower", "healthy": true}
  ],
  "commit_index": 12345,
  "term": 5
}
```

### Prometheus Metrics

```bash
# Scrape metrics
curl http://localhost:7474/metrics

# Key replication metrics
nornicdb_replication_mode{mode="raft"} 1
nornicdb_replication_is_leader 1
nornicdb_replication_commit_index 12345
nornicdb_replication_applied_index 12345
nornicdb_replication_lag_seconds 0.001
nornicdb_replication_peer_healthy{peer="node-2"} 1
nornicdb_replication_peer_healthy{peer="node-3"} 1
```

### Docker Health Checks

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:7474/health"]
  interval: 10s
  timeout: 5s
  retries: 3
  start_period: 30s
```

---

## Failover Operations

### Hot Standby Failover

#### Automatic Failover (Default)

Automatic failover is enabled by default when `NORNICDB_CLUSTER_HA_AUTO_FAILOVER=true`. When the standby detects that the primary has been unresponsive for `FAILOVER_TIMEOUT`, it automatically:

1. Attempts to fence the old primary (prevent split-brain)
2. Promotes itself to primary
3. Starts accepting writes

#### Manual Failover

```bash
# 1. Stop the primary gracefully (if possible)
docker stop nornicdb-primary

# 2. Promote the standby
curl -X POST http://localhost:7475/admin/promote

# 3. Update clients to point to new primary
# (or use routing driver for automatic discovery)

# 4. Optionally, restart old primary as new standby
docker start nornicdb-primary
# It will automatically detect it's no longer primary
```

### Raft Failover

Raft handles failover automatically through leader election:

1. When the leader fails, followers detect missing heartbeats
2. After `ELECTION_TIMEOUT`, a follower starts an election
3. The node with the most up-to-date log wins the election
4. Clients automatically discover the new leader

```bash
# Check current leader
curl http://localhost:7474/admin/cluster/status | jq '.leader'

# Force leader election (if needed)
curl -X POST http://localhost:7474/admin/cluster/transfer-leadership
```

### Multi-Region Failover

#### Automatic Regional Failover

Within each region, Raft handles failover automatically.

#### Cross-Region Failover

```bash
# Promote a region to primary
curl -X POST http://eu-west-node1:7474/admin/region/promote

# This will:
# 1. Ensure this region's Raft cluster has a leader
# 2. Mark this region as the primary write region
# 3. Notify other regions of the change
```

---

## Troubleshooting

### Common Issues

#### 1. Cluster Won't Form

**Symptoms:** Nodes can't see each other, no leader elected

**Solutions:**

```bash
# Check network connectivity
docker exec nornicdb-node1 ping node2

# Verify bind/advertise addresses
docker exec nornicdb-node1 env | grep NORNICDB_CLUSTER

# Check logs for errors
docker logs nornicdb-node1 2>&1 | grep -i error
```

#### 2. Split-Brain

**Symptoms:** Multiple nodes think they're the leader

**Solutions:**

```bash
# Check all nodes' status
for port in 7474 7475 7476; do
  echo "Node on port $port:"
  curl -s http://localhost:$port/health | jq '.replication'
done

# Force re-election (stop the incorrect leader)
docker restart nornicdb-node1
```

#### 3. Replication Lag

**Symptoms:** Standby/followers are behind

**Solutions:**

```bash
# Check lag metrics
curl http://localhost:7474/metrics | grep lag

# Increase batch size for faster catch-up
NORNICDB_CLUSTER_HA_WAL_BATCH_SIZE=5000

# Check network throughput
docker exec nornicdb-primary iperf3 -c standby
```

#### 4. Failover Not Triggering

**Symptoms:** Primary is down but standby hasn't promoted

**Solutions:**

```bash
# Check auto-failover is enabled
docker exec nornicdb-standby env | grep AUTO_FAILOVER

# Check failover timeout
docker exec nornicdb-standby env | grep FAILOVER_TIMEOUT

# Check standby logs
docker logs nornicdb-standby 2>&1 | grep -i failover

# Manual promotion
curl -X POST http://localhost:7475/admin/promote
```

### Log Levels

```bash
# Enable debug logging
NORNICDB_LOG_LEVEL=debug

# Enable replication-specific debug
NORNICDB_CLUSTER_DEBUG=true
```

### Recovery Procedures

#### Recovering from Complete Cluster Loss

```bash
# 1. Start one node with bootstrap
NORNICDB_CLUSTER_RAFT_BOOTSTRAP=true docker compose up -d nornicdb-node1

# 2. Wait for it to become leader
sleep 10

# 3. Add remaining nodes
docker compose up -d nornicdb-node2 nornicdb-node3

# 4. Verify cluster health
curl http://localhost:7474/admin/cluster/status
```

#### Restoring from Backup

```bash
# 1. Stop all nodes
docker compose down

# 2. Restore data to primary/bootstrap node
tar -xzf backup.tar.gz -C /path/to/primary-data

# 3. Clear other nodes' data (they'll sync from primary)
rm -rf /path/to/node2-data/*
rm -rf /path/to/node3-data/*

# 4. Start cluster
docker compose up -d
```

---

## Configuration Reference

### Environment Variables

| Variable                          | Default              | Description                         |
| --------------------------------- | -------------------- | ----------------------------------- |
| `NORNICDB_CLUSTER_MODE`           | `standalone`         | Replication mode                    |
| `NORNICDB_CLUSTER_NODE_ID`        | auto-generated       | Unique node identifier              |
| `NORNICDB_CLUSTER_BIND_ADDR`      | `0.0.0.0:7688`       | Address to bind for cluster traffic |
| `NORNICDB_CLUSTER_ADVERTISE_ADDR` | same as bind         | Address advertised to peers         |
| `NORNICDB_CLUSTER_DATA_DIR`       | `./data/replication` | Directory for replication state     |

#### Hot Standby

| Variable                               | Default     | Description                             |
| -------------------------------------- | ----------- | --------------------------------------- |
| `NORNICDB_CLUSTER_HA_ROLE`             | -           | `primary` or `standby` (required)       |
| `NORNICDB_CLUSTER_HA_PEER_ADDR`        | -           | Address of peer node (required)         |
| `NORNICDB_CLUSTER_HA_SYNC_MODE`        | `semi_sync` | Sync mode: `async`, `semi_sync`, `sync` |
| `NORNICDB_CLUSTER_HA_HEARTBEAT_MS`     | `1000`      | Heartbeat interval in ms                |
| `NORNICDB_CLUSTER_HA_FAILOVER_TIMEOUT` | `30s`       | Time before failover                    |
| `NORNICDB_CLUSTER_HA_AUTO_FAILOVER`    | `true`      | Enable automatic failover               |

#### Raft

| Variable                                   | Default    | Description               |
| ------------------------------------------ | ---------- | ------------------------- |
| `NORNICDB_CLUSTER_RAFT_CLUSTER_ID`         | `nornicdb` | Cluster identifier        |
| `NORNICDB_CLUSTER_RAFT_BOOTSTRAP`          | `false`    | Bootstrap new cluster     |
| `NORNICDB_CLUSTER_RAFT_PEERS`              | -          | Comma-separated peers     |
| `NORNICDB_CLUSTER_RAFT_ELECTION_TIMEOUT`   | `1s`       | Election timeout          |
| `NORNICDB_CLUSTER_RAFT_HEARTBEAT_TIMEOUT`  | `100ms`    | Heartbeat timeout         |
| `NORNICDB_CLUSTER_RAFT_SNAPSHOT_INTERVAL`  | `300`      | Seconds between snapshots |
| `NORNICDB_CLUSTER_RAFT_SNAPSHOT_THRESHOLD` | `10000`    | Entries before snapshot   |

#### Multi-Region

| Variable                             | Default           | Description                  |
| ------------------------------------ | ----------------- | ---------------------------- |
| `NORNICDB_CLUSTER_REGION_ID`         | -                 | Region identifier (required) |
| `NORNICDB_CLUSTER_REMOTE_REGIONS`    | -                 | Remote region addresses      |
| `NORNICDB_CLUSTER_CROSS_REGION_MODE` | `async`           | Cross-region sync mode       |
| `NORNICDB_CLUSTER_CONFLICT_STRATEGY` | `last_write_wins` | Conflict resolution          |

---

## Best Practices

### Network Configuration

1. **Use dedicated network for cluster traffic** - Separate user traffic from replication
2. **Low latency between nodes** - < 1ms for Raft, < 100ms for HA standby
3. **Reliable network** - Packet loss causes leader elections

### Security

1. **Enable TLS** for cluster communication (coming soon)
2. **Use firewalls** to restrict cluster port access
3. **Separate credentials** for admin operations

### Capacity Planning

| Mode         | Min Nodes | Recommended | Max Practical |
| ------------ | --------- | ----------- | ------------- |
| Hot Standby  | 2         | 2           | 2             |
| Raft         | 3         | 3-5         | 7             |
| Multi-Region | 6         | 9+          | No limit      |

### Monitoring

1. **Alert on** leader changes, replication lag, peer health
2. **Dashboard** replication metrics alongside application metrics
3. **Test failover** regularly in non-production environments

---

## Technical Deep Dive

This section explains the internal architecture of NornicDB clustering for users who want to understand how the system works or need to troubleshoot advanced issues.

### Network Architecture

NornicDB uses two separate network protocols:

```
┌─────────────────────────────────────────────────────────────┐
│                     NornicDB Node                           │
├─────────────────────────────┬───────────────────────────────┤
│      Client Traffic         │      Cluster Traffic          │
│   ┌─────────────────────┐   │   ┌─────────────────────────┐ │
│   │  Bolt Protocol      │   │   │  Cluster Protocol       │ │
│   │  (Port 7687)        │   │   │  (Port 7688)            │ │
│   ├─────────────────────┤   │   ├─────────────────────────┤ │
│   │ • Cypher queries    │   │   │ • Raft consensus        │ │
│   │ • Result streaming  │   │   │   - RequestVote RPC     │ │
│   │ • Transactions      │   │   │   - AppendEntries RPC   │ │
│   │ • Neo4j compatible  │   │   │ • WAL streaming (HA)    │ │
│   └─────────────────────┘   │   │ • Heartbeats            │ │
│                             │   │ • Failover coordination │ │
│                             │   └─────────────────────────┘ │
└─────────────────────────────┴───────────────────────────────┘
```

**Port 7687 (Bolt Protocol):**

- Standard Neo4j Bolt protocol for client connections
- Used by all Neo4j drivers (Python, Java, Go, etc.)
- Handles Cypher query execution and result streaming
- In a cluster, followers forward write queries to the leader via Bolt

**Port 7688 (Cluster Protocol):**

- Binary protocol optimized for low-latency cluster communication
- Length-prefixed JSON messages over TCP
- Handles all cluster coordination and replication
- Should be firewalled from external access

### Message Flow Diagrams

#### Hot Standby Write Flow

```
Client                  Primary                 Standby
  │                        │                        │
  │─── WRITE (Bolt) ───────►                        │
  │                        │                        │
  │                        │── WALBatch ───────────►│
  │                        │                        │
  │                        │◄─ WALBatchResponse ────│
  │                        │                        │
  │◄── SUCCESS ────────────│                        │
  │                        │                        │
```

#### Raft Consensus Write Flow

```
Client                  Leader               Follower 1         Follower 2
  │                        │                     │                   │
  │── WRITE (Bolt) ────────►                     │                   │
  │                        │                     │                   │
  │                        │── AppendEntries ───►│                   │
  │                        │── AppendEntries ────┼──────────────────►│
  │                        │                     │                   │
  │                        │◄── Success ─────────│                   │
  │                        │◄── Success ──────────────────────────────│
  │                        │                     │                   │
  │                        │ (quorum reached)    │                   │
  │◄── SUCCESS ────────────│                     │                   │
  │                        │                     │                   │
```

#### Raft Leader Election

```
           Follower A              Follower B              Follower C
               │                       │                       │
               │ (leader timeout)      │                       │
               │                       │                       │
    ┌──────────┴──────────┐            │                       │
    │ Become CANDIDATE    │            │                       │
    │ Increment term      │            │                       │
    │ Vote for self       │            │                       │
    └──────────┬──────────┘            │                       │
               │                       │                       │
               │── RequestVote ────────►                       │
               │── RequestVote ─────────────────────────────────►
               │                       │                       │
               │◄── VoteGranted ───────│                       │
               │◄── VoteGranted ─────────────────────────────────│
               │                       │                       │
    ┌──────────┴──────────┐            │                       │
    │ Become LEADER       │            │                       │
    │ (majority votes)    │            │                       │
    └──────────┬──────────┘            │                       │
               │                       │                       │
               │── AppendEntries ──────► (heartbeat)           │
               │── AppendEntries ───────────────────────────────►
               │                       │                       │
```

### Wire Protocol

The cluster protocol uses a simple length-prefixed JSON format:

```
┌─────────────┬─────────────────────────────────────┐
│ Length (4B) │          JSON Payload               │
│ Big Endian  │                                     │
└─────────────┴─────────────────────────────────────┘
```

**Message Types:**

| Type                  | Code | Direction            | Description              |
| --------------------- | ---- | -------------------- | ------------------------ |
| VoteRequest           | 1    | Candidate → Follower | Request vote in election |
| VoteResponse          | 2    | Follower → Candidate | Grant/deny vote          |
| AppendEntries         | 3    | Leader → Follower    | Replicate log entries    |
| AppendEntriesResponse | 4    | Follower → Leader    | Acknowledge entries      |
| WALBatch              | 5    | Primary → Standby    | Stream WAL entries (HA)  |
| WALBatchResponse      | 6    | Standby → Primary    | Acknowledge WAL          |
| Heartbeat             | 7    | Primary → Standby    | Health check             |
| HeartbeatResponse     | 8    | Standby → Primary    | Health status            |
| Fence                 | 9    | Standby → Primary    | Fence old primary        |
| FenceResponse         | 10   | Primary → Standby    | Acknowledge fence        |
| Promote               | 11   | Admin → Standby      | Promote to primary       |
| PromoteResponse       | 12   | Standby → Admin      | Promotion status         |

### Configuration Parameter Details

#### Election Timeout (`NORNICDB_CLUSTER_RAFT_ELECTION_TIMEOUT`)

Time a follower waits without hearing from the leader before starting an election.

```
Recommended values:
  - Same datacenter: 150ms - 500ms
  - Same region: 500ms - 2s
  - Cross-region: 2s - 10s (higher than network RTT)

Formula: election_timeout > 2 × heartbeat_timeout + max_network_RTT
```

**Too low:** Frequent unnecessary elections, cluster instability
**Too high:** Slow failure detection, longer downtime during failover

#### Heartbeat Timeout (`NORNICDB_CLUSTER_RAFT_HEARTBEAT_TIMEOUT`)

How often the leader sends heartbeats to maintain authority.

```
Recommended values:
  - Same datacenter: 50ms - 100ms
  - Same region: 100ms - 500ms
  - Cross-region: 500ms - 2s

Formula: heartbeat_timeout < election_timeout / 2
```

#### WAL Batch Size (`NORNICDB_CLUSTER_HA_WAL_BATCH_SIZE`)

Number of WAL entries sent per batch during replication.

```
Trade-offs:
  - Higher = better throughput, higher latency per write
  - Lower = lower latency, more network overhead

Recommended: 100-1000 for HA, 64 for Raft (via RAFT_MAX_APPEND_ENTRIES)
```

#### Sync Mode (`NORNICDB_CLUSTER_HA_SYNC_MODE`)

| Mode        | Acknowledgment    | Data Safety       | Latency |
| ----------- | ----------------- | ----------------- | ------- |
| `async`     | Primary only      | Risk of data loss | Lowest  |
| `semi_sync` | Standby received  | Minimal data loss | Medium  |
| `sync`      | Standby persisted | No data loss      | Highest |

### Consistency Levels

For queries that support it, NornicDB supports tunable consistency:

| Level          | Meaning                  | Use Case                            |
| -------------- | ------------------------ | ----------------------------------- |
| `ONE`          | Read from any node       | Fastest reads, eventual consistency |
| `LOCAL_ONE`    | Read from local region   | Geographic locality                 |
| `QUORUM`       | Majority must agree      | Strong consistency                  |
| `LOCAL_QUORUM` | Majority in local region | Regional consistency                |
| `ALL`          | All nodes must agree     | Maximum consistency, slowest        |

### Connection Pool Configuration

For applications connecting to clusters, configure your driver's connection pool:

```python
# Python example
from neo4j import GraphDatabase

driver = GraphDatabase.driver(
    "bolt://node1:7687",
    auth=("admin", "admin"),
    max_connection_pool_size=50,
    connection_acquisition_timeout=60,
    max_transaction_retry_time=30,
    # For routing drivers (automatic failover):
    # "neo4j://node1:7687"  # Use neo4j:// scheme
)
```

```go
// Go example
driver, _ := neo4j.NewDriver(
    "bolt://node1:7687",
    neo4j.BasicAuth("admin", "admin", ""),
    func(config *neo4j.Config) {
        config.MaxConnectionPoolSize = 50
        config.ConnectionAcquisitionTimeout = time.Minute
        config.MaxTransactionRetryTime = 30 * time.Second
    },
)
```

### TLS Configuration

**Important:** TLS for cluster communication is strongly recommended in production.

| Variable                             | Description                           |
| ------------------------------------ | ------------------------------------- |
| `NORNICDB_CLUSTER_TLS_ENABLED`       | Enable TLS (`true`/`false`)           |
| `NORNICDB_CLUSTER_TLS_CERT_FILE`     | Path to server certificate (PEM)      |
| `NORNICDB_CLUSTER_TLS_KEY_FILE`      | Path to private key (PEM)             |
| `NORNICDB_CLUSTER_TLS_CA_FILE`       | Path to CA certificate for mTLS       |
| `NORNICDB_CLUSTER_TLS_VERIFY_CLIENT` | Require client certs (`true`/`false`) |
| `NORNICDB_CLUSTER_TLS_MIN_VERSION`   | Minimum TLS version (`1.2` or `1.3`)  |

Example with mTLS:

```yaml
environment:
  NORNICDB_CLUSTER_TLS_ENABLED: "true"
  NORNICDB_CLUSTER_TLS_CERT_FILE: /certs/server.crt
  NORNICDB_CLUSTER_TLS_KEY_FILE: /certs/server.key
  NORNICDB_CLUSTER_TLS_CA_FILE: /certs/ca.crt
  NORNICDB_CLUSTER_TLS_VERIFY_CLIENT: "true"
  NORNICDB_CLUSTER_TLS_MIN_VERSION: "1.3"
volumes:
  - ./certs:/certs:ro
```

### Metrics Reference

Key metrics to monitor:

| Metric                                  | Description        | Alert Threshold  |
| --------------------------------------- | ------------------ | ---------------- |
| `nornicdb_replication_lag_seconds`      | Time behind leader | > 5s             |
| `nornicdb_cluster_leader_changes_total` | Leader elections   | > 1/hour         |
| `nornicdb_raft_term`                    | Current Raft term  | Sudden increases |
| `nornicdb_wal_position`                 | WAL write position | Divergence       |
| `nornicdb_peer_healthy`                 | Peer health status | 0 (unhealthy)    |
| `nornicdb_replication_bytes_total`      | Data replicated    | Sudden drops     |

### Debugging Commands

```bash
# Check cluster status (all modes)
curl http://localhost:7474/admin/cluster/status | jq

# Check Raft state
curl http://localhost:7474/admin/raft/state | jq

# Check replication lag
curl http://localhost:7474/admin/replication/lag

# Force step-down (leader only)
curl -X POST http://localhost:7474/admin/raft/step-down

# Transfer leadership to specific node
curl -X POST http://localhost:7474/admin/raft/transfer-leadership \
  -H "Content-Type: application/json" \
  -d '{"target": "node-2"}'

# Check WAL position
curl http://localhost:7474/admin/wal/position

# Snapshot now (Raft)
curl -X POST http://localhost:7474/admin/raft/snapshot
```

---

## Next Steps

- [Replication Architecture](../architecture/replication.md) - Internal architecture details
- [Complete Examples](./complete-examples.md) - End-to-end usage examples
- [System Design](../architecture/system-design.md) - Overall system architecture
- [Plugin System](./plugin-system.md) - APOC functions and plugins
