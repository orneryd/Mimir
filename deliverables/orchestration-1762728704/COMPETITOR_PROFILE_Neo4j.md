# Competitor Profile: Neo4j

## Overview
Neo4j is a native graph database designed for connected data, with recent additions of vector search capabilities to support AI and ML applications.

## Features
- Native graph storage and processing
- Cypher query language
- Vector similarity search (v5.0+)
- ACID transactions
- Graph algorithms library
- Full-text search

## Architecture
- Native graph storage engine
- Index-free adjacency
- Distributed clustering (Enterprise)
- Bolt protocol for client communication

## Memory Model
- Graph-based storage (nodes, relationships, properties)
- Vector indexes for similarity search
- Relationship-first traversal optimization
- Support for embeddings as node properties

## Pricing/Licensing
- Community Edition: Free (GPLv3)
- Enterprise Edition: Custom pricing
- AuraDB (cloud): Free tier, then pay-as-you-go
- Typical enterprise: $50k-$500k+ annually

## Deployment Options
- Self-hosted (Community and Enterprise)
- AuraDB (fully managed cloud)
- Neo4j Desktop (local development)
- Kubernetes deployment

## Integration Capabilities
- Drivers for Python, Java, JavaScript, .NET, Go
- Bolt protocol
- REST API
- GraphQL API
- LangChain, LlamaIndex integration
- Apache Spark connector

## Technical Pros
- Industry-leading graph database
- Powerful graph traversal and algorithms
- Strong ACID guarantees
- Mature ecosystem and tooling
- Combining graph + vector search

## Technical Cons
- Primary focus is graph, not vector search
- Vector search features relatively new
- Higher licensing costs for enterprise
- Performance may not match specialized vector DBs for pure similarity search

## Citations
- [Neo4j Documentation](https://neo4j.com/docs/)
- [Neo4j Vector Search](https://neo4j.com/docs/cypher-manual/current/indexes-for-vector-search/)
