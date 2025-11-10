# Competitor Profile: Weaviate

## Overview
Weaviate is an open-source vector database that stores both objects and vectors, enabling combining vector search with structured filtering.

## Features
- Vector search with GraphQL API
- Hybrid search (vector + keyword + scalar filtering)
- Modular vectorization (bring your own embeddings or use built-in)
- Multi-tenancy support
- CRUD operations on objects
- Real-time indexing

## Architecture
- Modular, plugin-based architecture
- Distributed deployment support
- HNSW index for ANN search
- GraphQL query interface

## Memory Model
- Object-vector dual storage
- Schema-based data modeling
- Vector embeddings per object
- Support for multiple vector spaces per class

## Pricing/Licensing
- Open-source (BSD-3-Clause license)
- Weaviate Cloud Services: Starting at $25/month
- Self-hosted: Free
- Enterprise support: Custom pricing

## Deployment Options
- Self-hosted (Docker, Kubernetes)
- Weaviate Cloud Services (managed)
- Hybrid deployment support

## Integration Capabilities
- Python, JavaScript, Go, Java clients
- GraphQL API
- REST API
- LangChain, LlamaIndex integration
- Built-in vectorizers (OpenAI, Cohere, HuggingFace)

## Technical Pros
- Open-source with active community
- Flexible schema design
- Strong filtering capabilities
- Self-hosting option
- Good balance of features and performance

## Technical Cons
- GraphQL learning curve
- Complex configuration for advanced features
- Resource-intensive for large datasets
- Limited graph traversal compared to Neo4j

## Citations
- [Weaviate Documentation](https://weaviate.io/developers/weaviate)
- [Weaviate GitHub](https://github.com/weaviate/weaviate)
