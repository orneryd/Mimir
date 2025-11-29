/**
 * NornicDB - FastRP (Fast Random Projection) Benchmark Suite
 * 
 * Tests node embedding capabilities using GDS-compatible procedures.
 * FastRP creates vector embeddings for nodes based on graph structure and properties.
 * 
 * Run with: npm run bench:fastrp
 */

import { describe, bench, beforeAll, afterAll } from 'vitest';
import neo4j, { Driver, Session } from 'neo4j-driver';

// ============================================================================
// CONFIGURATION
// ============================================================================

const NORNICDB_URI = process.env.NORNICDB_URI || 'bolt://localhost:7687';
const NORNICDB_USER = process.env.NORNICDB_USER || 'admin';
const NORNICDB_PASSWORD = process.env.NORNICDB_PASSWORD || 'admin';

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

let nornicdbDriver: Driver;
let nornicdbSession: Session;

let nornicdbSupportsGDS = false;

// ============================================================================
// DATASET LOADER (Social Network for FastRP)
// ============================================================================

async function loadSocialNetworkDataset(session: Session): Promise<void> {
  // Clear existing data
  await session.run('MATCH (n) DETACH DELETE n');
  
  // Create a social network with age properties (for feature-based embeddings)
  await session.run(`
    CREATE
      (dan:Person {name: 'Dan', age: 18}),
      (annie:Person {name: 'Annie', age: 12}),
      (matt:Person {name: 'Matt', age: 22}),
      (jeff:Person {name: 'Jeff', age: 51}),
      (brie:Person {name: 'Brie', age: 45}),
      (elsa:Person {name: 'Elsa', age: 65}),
      (john:Person {name: 'John', age: 64}),
      (alice:Person {name: 'Alice', age: 28}),
      (bob:Person {name: 'Bob', age: 35}),
      (carol:Person {name: 'Carol', age: 42}),
      (david:Person {name: 'David', age: 33}),
      (eve:Person {name: 'Eve', age: 29}),
      (frank:Person {name: 'Frank', age: 55}),
      (grace:Person {name: 'Grace', age: 47}),
      (henry:Person {name: 'Henry', age: 38}),
      (iris:Person {name: 'Iris', age: 31}),
      (jack:Person {name: 'Jack', age: 26}),
      (kate:Person {name: 'Kate', age: 40}),
      (leo:Person {name: 'Leo', age: 52}),
      (mary:Person {name: 'Mary', age: 36}),
      
      (dan)-[:KNOWS {weight: 1.0}]->(annie),
      (dan)-[:KNOWS {weight: 1.0}]->(matt),
      (annie)-[:KNOWS {weight: 1.0}]->(matt),
      (annie)-[:KNOWS {weight: 1.0}]->(jeff),
      (annie)-[:KNOWS {weight: 1.0}]->(brie),
      (matt)-[:KNOWS {weight: 3.5}]->(brie),
      (brie)-[:KNOWS {weight: 1.0}]->(elsa),
      (brie)-[:KNOWS {weight: 2.0}]->(jeff),
      (john)-[:KNOWS {weight: 1.0}]->(jeff),
      (alice)-[:KNOWS {weight: 2.0}]->(bob),
      (alice)-[:KNOWS {weight: 1.5}]->(carol),
      (bob)-[:KNOWS {weight: 1.0}]->(david),
      (carol)-[:KNOWS {weight: 2.5}]->(eve),
      (david)-[:KNOWS {weight: 1.0}]->(frank),
      (eve)-[:KNOWS {weight: 1.0}]->(grace),
      (frank)-[:KNOWS {weight: 3.0}]->(henry),
      (grace)-[:KNOWS {weight: 1.0}]->(iris),
      (henry)-[:KNOWS {weight: 2.0}]->(jack),
      (iris)-[:KNOWS {weight: 1.0}]->(kate),
      (jack)-[:KNOWS {weight: 1.5}]->(leo),
      (kate)-[:KNOWS {weight: 1.0}]->(mary),
      (leo)-[:KNOWS {weight: 2.0}]->(mary),
      (alice)-[:KNOWS {weight: 1.0}]->(dan),
      (bob)-[:KNOWS {weight: 1.0}]->(matt),
      (carol)-[:KNOWS {weight: 1.0}]->(brie),
      (david)-[:KNOWS {weight: 1.0}]->(jeff),
      (eve)-[:KNOWS {weight: 1.0}]->(elsa),
      (frank)-[:KNOWS {weight: 1.0}]->(john)
  `);
}

// ============================================================================
// GDS GRAPH PROJECTION (if supported)
// ============================================================================

async function createGDSProjection(session: Session, graphName: string): Promise<boolean> {
  try {
    // Check if graph already exists
    const existingGraphs = await session.run(`
      CALL gds.graph.list() YIELD graphName
      RETURN graphName
    `);
    
    const graphExists = existingGraphs.records.some(r => r.get('graphName') === graphName);
    
    if (graphExists) {
      await session.run(`CALL gds.graph.drop('${graphName}')`);
    }
    
    // Create undirected graph projection with node properties and relationship weights
    await session.run(`
      MATCH (source:Person)-[r:KNOWS]->(target:Person)
      RETURN gds.graph.project(
        '${graphName}',
        source,
        target,
        {
          sourceNodeProperties: source { .age },
          targetNodeProperties: target { .age },
          relationshipProperties: r { .weight }
        },
        { undirectedRelationshipTypes: ['*'] }
      )
    `);
    
    return true;
  } catch (error) {
    console.log(`  ⚠️  GDS graph projection not supported: ${error}`);
    return false;
  }
}

// ============================================================================
// SETUP AND TEARDOWN
// ============================================================================

beforeAll(async () => {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║         FastRP Node Embeddings Benchmark Suite                     ║');
  console.log('║         NornicDB GDS Compatibility Test                            ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');
  
  // Connect to NornicDB
  console.log(`Connecting to NornicDB at ${NORNICDB_URI}...`);
  try {
    nornicdbDriver = neo4j.driver(NORNICDB_URI, neo4j.auth.basic(NORNICDB_USER, NORNICDB_PASSWORD));
    nornicdbSession = nornicdbDriver.session();
    await nornicdbSession.run('RETURN 1');
    console.log('✓ Connected to NornicDB');
    
    console.log('Loading social network dataset into NornicDB...');
    await loadSocialNetworkDataset(nornicdbSession);
    const result1 = await nornicdbSession.run('MATCH (n:Person) RETURN count(n) as count');
    console.log(`  → ${result1.records[0].get('count')} people created in NornicDB`);
    
    // Check GDS support
    console.log('Checking Graph Data Science (GDS) support in NornicDB...');
    try {
      await nornicdbSession.run('CALL gds.version() YIELD version RETURN version');
      nornicdbSupportsGDS = true;
      console.log('  ✓ NornicDB supports GDS procedures');
      
      // Create GDS projection
      console.log('Creating GDS graph projection in NornicDB...');
      await createGDSProjection(nornicdbSession, 'persons-nornicdb');
    } catch (error) {
      console.log('  ⚠️  NornicDB does not support GDS procedures');
      nornicdbSupportsGDS = false;
    }
  } catch (error) {
    console.error(`✗ Failed to connect to NornicDB: ${error}`);
  }
  
  console.log('\n' + '─'.repeat(72) + '\n');
});

afterAll(async () => {
  console.log('\n' + '─'.repeat(72));
  console.log('Cleaning up...');
  
  // Drop GDS projections
  if (nornicdbSession && nornicdbSupportsGDS) {
    try {
      await nornicdbSession.run("CALL gds.graph.drop('persons-nornicdb')");
    } catch (e) {}
  }
  
  // Clear data
  if (nornicdbSession) {
    await nornicdbSession.run('MATCH (n) DETACH DELETE n').catch(() => {});
    await nornicdbSession.close();
  }
  if (nornicdbDriver) await nornicdbDriver.close();
  
  console.log('✓ Cleanup complete\n');
});

// ============================================================================
// NORNICDB BENCHMARKS
// ============================================================================

describe('NornicDB - FastRP Embeddings', () => {
  if (nornicdbSupportsGDS) {
    // Basic FastRP - Stream mode
    bench('FastRP stream (dim=8)', async () => {
      await nornicdbSession.run(`
        CALL gds.fastRP.stream('persons-nornicdb', {
          embeddingDimension: 8,
          randomSeed: 42
        })
        YIELD nodeId, embedding
        RETURN nodeId, embedding
      `);
    });
    
    bench('FastRP stream (dim=128)', async () => {
      await nornicdbSession.run(`
        CALL gds.fastRP.stream('persons-nornicdb', {
          embeddingDimension: 128,
          randomSeed: 42
        })
        YIELD nodeId, embedding
        RETURN nodeId, embedding
      `);
    });
    
    bench('FastRP stream with weights (dim=64)', async () => {
      await nornicdbSession.run(`
        CALL gds.fastRP.stream('persons-nornicdb', {
          embeddingDimension: 64,
          randomSeed: 42,
          relationshipWeightProperty: 'weight'
        })
        YIELD nodeId, embedding
        RETURN nodeId, embedding
      `);
    });
    
    bench('FastRP with node features (age)', async () => {
      await nornicdbSession.run(`
        CALL gds.fastRP.stream('persons-nornicdb', {
          embeddingDimension: 32,
          randomSeed: 42,
          propertyRatio: 0.5,
          featureProperties: ['age']
        })
        YIELD nodeId, embedding
        RETURN nodeId, embedding
      `);
    });
    
    bench('FastRP stats (performance check)', async () => {
      await nornicdbSession.run(`
        CALL gds.fastRP.stats('persons-nornicdb', {
          embeddingDimension: 64,
          randomSeed: 42
        })
        YIELD nodeCount
        RETURN nodeCount
      `);
    });
    
  } else {
    // Fallback: Manual embedding-like queries (no GDS)
    bench('Manual: Aggregate neighbor ages', async () => {
      await nornicdbSession.run(`
        MATCH (p:Person)
        OPTIONAL MATCH (p)-[:KNOWS]-(neighbor:Person)
        RETURN p.name, 
               avg(neighbor.age) as avg_neighbor_age,
               count(neighbor) as neighbor_count
      `);
    });
    
    bench('Manual: 2-hop neighborhood features', async () => {
      await nornicdbSession.run(`
        MATCH (p:Person)
        OPTIONAL MATCH (p)-[:KNOWS*1..2]-(neighbor:Person)
        WHERE p <> neighbor
        RETURN p.name,
               avg(neighbor.age) as avg_neighbor_age,
               count(DISTINCT neighbor) as reach
      `);
    });
    
    bench('Manual: Weighted neighbor aggregation', async () => {
      await nornicdbSession.run(`
        MATCH (p:Person)-[r:KNOWS]-(neighbor:Person)
        RETURN p.name,
               sum(r.weight * neighbor.age) / sum(r.weight) as weighted_avg_age,
               sum(r.weight) as total_weight
      `);
    });
  }
});
