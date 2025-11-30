/**
 * Large-Scale Benchmark Suite for NornicDB vs Neo4j
 * 
 * Datasets:
 * 1. Movies Dataset (~280 nodes, ~900 edges) - Classic Neo4j benchmark
 * 2. Social Network (~500 nodes, ~3500 edges) - Pokec-style
 * 3. E-commerce (~1000 nodes, ~1800 edges) - Products, reviews, users
 * 
 * Total: ~1780 nodes, ~6200 relationships
 * 
 * Compares performance between:
 * - NornicDB (drop-in replacement): bolt://localhost:7687
 * - Neo4j: bolt://localhost:7688
 * 
 * Run with: npm run bench:large
 */

import { bench, describe, beforeAll, afterAll } from 'vitest';
import neo4j, { Driver, Session } from 'neo4j-driver';

// Configuration
const NORNICDB_URI = process.env.NORNICDB_URI || 'bolt://localhost:7687';
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7688';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

let nornicdbDriver: Driver;
let nornicdbSession: Session;
let neo4jDriver: Driver;
let neo4jSession: Session;

// =============================================================================
// Data Generators
// =============================================================================

const genres = ['Action', 'Comedy', 'Drama', 'Sci-Fi', 'Horror', 'Romance', 'Thriller', 'Documentary'];
const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emma', 'Chris', 'Lisa', 'Tom', 'Kate'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Taylor'];
const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose'];
const categories = ['Electronics', 'Clothing', 'Books', 'Home', 'Sports', 'Toys', 'Beauty', 'Food'];
const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum'];

// =============================================================================
// Dataset Loaders
// =============================================================================

async function loadMoviesDataset(s: Session) {
  // Create 100 actors
  for (let i = 0; i < 100; i++) {
    await s.run(
      'CREATE (a:Actor {name: $name, born: $born})',
      { name: `${firstNames[i % 10]} ${lastNames[Math.floor(i / 10)]}`, born: 1950 + (i % 50) }
    );
  }
  
  // Create 30 directors  
  for (let i = 0; i < 30; i++) {
    await s.run(
      'CREATE (d:Director {name: $name, born: $born})',
      { name: `Director_${i}`, born: 1940 + (i % 40) }
    );
  }
  
  // Create 150 movies
  for (let i = 0; i < 150; i++) {
    await s.run(
      'CREATE (m:Movie {title: $title, released: $released, genre: $genre})',
      { title: `Movie_${i}`, released: 1980 + (i % 44), genre: genres[i % genres.length] }
    );
  }
  
  // Create ACTED_IN relationships (5 actors per movie = 750 relationships)
  for (let movieId = 0; movieId < 150; movieId++) {
    for (let j = 0; j < 5; j++) {
      const actorIdx = (movieId * 5 + j) % 100;
      await s.run(
        `MATCH (a:Actor {name: $actorName}), (m:Movie {title: $movieTitle})
         CREATE (a)-[:ACTED_IN {role: $role}]->(m)`,
        { actorName: `${firstNames[actorIdx % 10]} ${lastNames[Math.floor(actorIdx / 10)]}`, movieTitle: `Movie_${movieId}`, role: `Role_${j}` }
      );
    }
  }
  
  // Create DIRECTED relationships (1 director per movie = 150 relationships)
  for (let i = 0; i < 150; i++) {
    await s.run(
      `MATCH (d:Director {name: $directorName}), (m:Movie {title: $movieTitle})
       CREATE (d)-[:DIRECTED]->(m)`,
      { directorName: `Director_${i % 30}`, movieTitle: `Movie_${i}` }
    );
  }
}

async function loadSocialNetwork(s: Session) {
  // Create 500 users
  for (let i = 0; i < 500; i++) {
    await s.run(
      'CREATE (u:Person {id: $id, name: $name, age: $age, city: $city})',
      { id: i, name: `User_${i}`, age: 18 + (i % 60), city: cities[i % cities.length] }
    );
  }
  
  // Create ~3500 FOLLOWS relationships (7 per user on average)
  for (let i = 0; i < 500; i++) {
    const followCount = 5 + (i % 5); // 5-9 follows per user
    for (let j = 0; j < followCount; j++) {
      const targetId = (i + j * 7 + 1) % 500;
      if (targetId !== i) {
        await s.run(
          `MATCH (a:Person {id: $from}), (b:Person {id: $to})
           CREATE (a)-[:FOLLOWS {since: $since}]->(b)`,
          { from: i, to: targetId, since: `202${i % 4}-0${(j % 9) + 1}-01` }
        );
      }
    }
  }
}

async function loadEcommerceData(s: Session) {
  // Create 300 products
  for (let i = 0; i < 300; i++) {
    await s.run(
      'CREATE (p:Product {id: $id, name: $name, price: $price, stock: $stock, category: $category})',
      { id: i, name: `Product_${i}`, price: 10 + (i % 990), stock: i % 1000, category: categories[i % categories.length] }
    );
  }
  
  // Create 200 customers
  for (let i = 0; i < 200; i++) {
    await s.run(
      'CREATE (c:Customer {id: $id, name: $name, email: $email, tier: $tier})',
      { id: i, name: `Customer_${i}`, email: `customer${i}@test.com`, tier: tiers[i % tiers.length] }
    );
  }
  
  // Create 500 orders with PLACED relationships
  for (let i = 0; i < 500; i++) {
    const customerId = i % 200;
    await s.run(
      `MATCH (c:Customer {id: $customerId})
       CREATE (o:Order {id: $orderId, date: $date, total: $total})
       CREATE (c)-[:PLACED]->(o)`,
      { customerId, orderId: i, date: `2023-${String((i % 12) + 1).padStart(2, '0')}-15`, total: 20 + (i % 480) }
    );
  }
  
  // Create 800 reviews with REVIEWED relationships
  for (let i = 0; i < 800; i++) {
    const productId = i % 300;
    const customerId = i % 200;
    await s.run(
      `MATCH (p:Product {id: $productId}), (c:Customer {id: $customerId})
       CREATE (c)-[:REVIEWED {rating: $rating}]->(p)`,
      { productId, customerId, rating: 1 + (i % 5) }
    );
  }
}

async function loadAllDatasets(s: Session, dbName: string) {
  console.log(`  → Loading Movies dataset into ${dbName}...`);
  await loadMoviesDataset(s);
  const movieCount = await s.run('MATCH (n) WHERE n:Actor OR n:Director OR n:Movie RETURN count(n) as c');
  console.log(`    ✓ Movies: ${movieCount.records[0].get('c')} nodes`);
  
  console.log(`  → Loading Social Network into ${dbName}...`);
  await loadSocialNetwork(s);
  const socialCount = await s.run('MATCH (p:Person) RETURN count(p) as c');
  console.log(`    ✓ Social: ${socialCount.records[0].get('c')} users`);
  
  console.log(`  → Loading E-commerce data into ${dbName}...`);
  await loadEcommerceData(s);
  const ecomCount = await s.run('MATCH (n) WHERE n:Product OR n:Customer OR n:Order RETURN count(n) as c');
  console.log(`    ✓ E-commerce: ${ecomCount.records[0].get('c')} nodes`);
  
  // Verify totals
  const countResult = await s.run('MATCH (n) RETURN count(n) as nodeCount');
  const edgeResult = await s.run('MATCH ()-[r]->() RETURN count(r) as edgeCount');
  console.log(`  ✓ ${dbName} Total: ${countResult.records[0].get('nodeCount')} nodes, ${edgeResult.records[0].get('edgeCount')} relationships\n`);
}

// =============================================================================
// SETUP AND TEARDOWN (at module level - required for vitest bench)
// =============================================================================

beforeAll(async () => {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║      NornicDB vs Neo4j - Large-Scale Benchmark Suite               ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');
  
  // Connect to NornicDB
  console.log(`Connecting to NornicDB at ${NORNICDB_URI}...`);
  try {
    nornicdbDriver = neo4j.driver(NORNICDB_URI);
    nornicdbSession = nornicdbDriver.session();
    await nornicdbSession.run('RETURN 1');
    console.log('✓ Connected to NornicDB\n');
    
    await nornicdbSession.run('MATCH (n) DETACH DELETE n');
    console.log('  → Cleared existing NornicDB data');
    await loadAllDatasets(nornicdbSession, 'NornicDB');
  } catch (error) {
    console.error('✗ Failed to connect to NornicDB:', error);
  }
  
  // Connect to Neo4j
  console.log(`Connecting to Neo4j at ${NEO4J_URI}...`);
  try {
    neo4jDriver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    neo4jSession = neo4jDriver.session();
    await neo4jSession.run('RETURN 1');
    console.log('✓ Connected to Neo4j\n');
    
    await neo4jSession.run('MATCH (n) DETACH DELETE n');
    console.log('  → Cleared existing Neo4j data');
    await loadAllDatasets(neo4jSession, 'Neo4j');
  } catch (error) {
    console.error('✗ Failed to connect to Neo4j:', error);
  }
  
  console.log('─'.repeat(72) + '\n');
}, 600000); // 10 minute timeout for loading both DBs

afterAll(async () => {
  console.log('\n' + '─'.repeat(72));
  console.log('Cleaning up...');
  
  if (nornicdbSession) {
    await nornicdbSession.run('MATCH (n) DETACH DELETE n').catch(() => {});
    await nornicdbSession.close();
  }
  if (nornicdbDriver) await nornicdbDriver.close();
  
  if (neo4jSession) {
    await neo4jSession.run('MATCH (n) DETACH DELETE n').catch(() => {});
    await neo4jSession.close();
  }
  if (neo4jDriver) await neo4jDriver.close();
  
  console.log('✓ Cleanup complete\n');
}, 30000);

// =============================================================================
// NORNICDB BENCHMARKS
// =============================================================================

describe('NornicDB Large-Scale', () => {
  
  // Movies queries
  bench('Movies: Count actors', async () => {
    await nornicdbSession.run('MATCH (a:Actor) RETURN count(a) as count');
  });

  bench('Movies: Find actors born after 1970', async () => {
    await nornicdbSession.run('MATCH (a:Actor) WHERE a.born > 1970 RETURN a.name, a.born');
  });

  bench('Movies: Movies by genre', async () => {
    await nornicdbSession.run('MATCH (m:Movie) WHERE m.genre = "Action" RETURN m.title, m.released');
  });

  bench('Movies: Actors with movie count', async () => {
    await nornicdbSession.run(`
      MATCH (a:Actor)-[:ACTED_IN]->(m:Movie)
      RETURN a.name, count(m) as movieCount
      ORDER BY movieCount DESC
      LIMIT 10
    `);
  });

  bench('Movies: Directors with avg movie year', async () => {
    await nornicdbSession.run(`
      MATCH (d:Director)-[:DIRECTED]->(m:Movie)
      RETURN d.name, avg(m.released) as avgYear, count(m) as movieCount
    `);
  });

  bench('Movies: Co-actors (2-hop)', async () => {
    await nornicdbSession.run(`
      MATCH (a:Actor {name: 'John Smith'})-[:ACTED_IN]->(m:Movie)<-[:ACTED_IN]-(coactor:Actor)
      RETURN DISTINCT coactor.name
      LIMIT 20
    `);
  });

  // Social Network queries
  bench('Social: Count users by city', async () => {
    await nornicdbSession.run(`
      MATCH (p:Person)
      RETURN p.city, count(p) as userCount
      ORDER BY userCount DESC
    `);
  });

  bench('Social: Average age by city', async () => {
    await nornicdbSession.run(`
      MATCH (p:Person)
      RETURN p.city, avg(p.age) as avgAge, min(p.age) as minAge, max(p.age) as maxAge
    `);
  });

  bench('Social: Users with follower count', async () => {
    await nornicdbSession.run(`
      MATCH (p:Person)<-[:FOLLOWS]-(follower:Person)
      RETURN p.name, count(follower) as followers
      ORDER BY followers DESC
      LIMIT 10
    `);
  });

  bench('Social: Mutual follows', async () => {
    await nornicdbSession.run(`
      MATCH (a:Person)-[:FOLLOWS]->(b:Person)-[:FOLLOWS]->(a)
      RETURN a.name, b.name
      LIMIT 20
    `);
  });

  bench('Social: Friends of friends (2-hop)', async () => {
    await nornicdbSession.run(`
      MATCH (p:Person {id: 1})-[:FOLLOWS]->(friend)-[:FOLLOWS]->(fof)
      WHERE fof <> p
      RETURN DISTINCT fof.name
      LIMIT 20
    `);
  });

  // E-commerce queries
  bench('Ecommerce: Products by category', async () => {
    await nornicdbSession.run(`
      MATCH (p:Product)
      RETURN p.category, count(p) as productCount, avg(p.price) as avgPrice
      ORDER BY productCount DESC
    `);
  });

  bench('Ecommerce: Top rated products', async () => {
    await nornicdbSession.run(`
      MATCH (c:Customer)-[r:REVIEWED]->(p:Product)
      RETURN p.name, avg(r.rating) as avgRating, count(r) as reviewCount
      ORDER BY avgRating DESC
      LIMIT 10
    `);
  });

  bench('Ecommerce: Customer order totals', async () => {
    await nornicdbSession.run(`
      MATCH (c:Customer)-[:PLACED]->(o:Order)
      RETURN c.name, c.tier, sum(o.total) as totalSpent, count(o) as orderCount
      ORDER BY totalSpent DESC
      LIMIT 10
    `);
  });

  bench('Ecommerce: Revenue by customer tier', async () => {
    await nornicdbSession.run(`
      MATCH (c:Customer)-[:PLACED]->(o:Order)
      RETURN c.tier, sum(o.total) as revenue, count(o) as orders, avg(o.total) as avgOrder
      ORDER BY revenue DESC
    `);
  });

  bench('Ecommerce: Low stock expensive products', async () => {
    await nornicdbSession.run(`
      MATCH (p:Product)
      WHERE p.stock < 100 AND p.price > 500
      RETURN p.name, p.price, p.stock, p.category
      ORDER BY p.stock ASC
    `);
  });

  // Complex queries
  bench('Complex: Multi-aggregation', async () => {
    await nornicdbSession.run(`
      MATCH (p:Product)
      RETURN 
        p.category,
        count(p) as products,
        sum(p.price) as totalValue,
        avg(p.price) as avgPrice,
        min(p.price) as minPrice,
        max(p.price) as maxPrice
      ORDER BY totalValue DESC
    `);
  });

  bench('Complex: Large result set (500 rows)', async () => {
    await nornicdbSession.run(`
      MATCH (a:Actor)-[:ACTED_IN]->(m:Movie)
      RETURN a.name, m.title, m.released
      LIMIT 500
    `);
  });

  bench('Write: Create and delete node', async () => {
    await nornicdbSession.run(`
      CREATE (t:Temp {id: 99999, name: 'Benchmark Test'})
      WITH t
      DELETE t
    `);
  });

  bench('Write: Create and delete relationship', async () => {
    await nornicdbSession.run(`
      MATCH (a:Actor), (m:Movie)
      WITH a, m LIMIT 1
      CREATE (a)-[r:TEMP_REL]->(m)
      DELETE r
    `);
  });
});

// =============================================================================
// NEO4J BENCHMARKS (same queries for comparison)
// =============================================================================

describe('Neo4j Large-Scale', () => {
  
  // Movies queries
  bench('Movies: Count actors', async () => {
    await neo4jSession.run('MATCH (a:Actor) RETURN count(a) as count');
  });

  bench('Movies: Find actors born after 1970', async () => {
    await neo4jSession.run('MATCH (a:Actor) WHERE a.born > 1970 RETURN a.name, a.born');
  });

  bench('Movies: Movies by genre', async () => {
    await neo4jSession.run('MATCH (m:Movie) WHERE m.genre = "Action" RETURN m.title, m.released');
  });

  bench('Movies: Actors with movie count', async () => {
    await neo4jSession.run(`
      MATCH (a:Actor)-[:ACTED_IN]->(m:Movie)
      RETURN a.name, count(m) as movieCount
      ORDER BY movieCount DESC
      LIMIT 10
    `);
  });

  bench('Movies: Directors with avg movie year', async () => {
    await neo4jSession.run(`
      MATCH (d:Director)-[:DIRECTED]->(m:Movie)
      RETURN d.name, avg(m.released) as avgYear, count(m) as movieCount
    `);
  });

  bench('Movies: Co-actors (2-hop)', async () => {
    await neo4jSession.run(`
      MATCH (a:Actor {name: 'John Smith'})-[:ACTED_IN]->(m:Movie)<-[:ACTED_IN]-(coactor:Actor)
      RETURN DISTINCT coactor.name
      LIMIT 20
    `);
  });

  // Social Network queries
  bench('Social: Count users by city', async () => {
    await neo4jSession.run(`
      MATCH (p:Person)
      RETURN p.city, count(p) as userCount
      ORDER BY userCount DESC
    `);
  });

  bench('Social: Average age by city', async () => {
    await neo4jSession.run(`
      MATCH (p:Person)
      RETURN p.city, avg(p.age) as avgAge, min(p.age) as minAge, max(p.age) as maxAge
    `);
  });

  bench('Social: Users with follower count', async () => {
    await neo4jSession.run(`
      MATCH (p:Person)<-[:FOLLOWS]-(follower:Person)
      RETURN p.name, count(follower) as followers
      ORDER BY followers DESC
      LIMIT 10
    `);
  });

  bench('Social: Mutual follows', async () => {
    await neo4jSession.run(`
      MATCH (a:Person)-[:FOLLOWS]->(b:Person)-[:FOLLOWS]->(a)
      RETURN a.name, b.name
      LIMIT 20
    `);
  });

  bench('Social: Friends of friends (2-hop)', async () => {
    await neo4jSession.run(`
      MATCH (p:Person {id: 1})-[:FOLLOWS]->(friend)-[:FOLLOWS]->(fof)
      WHERE fof <> p
      RETURN DISTINCT fof.name
      LIMIT 20
    `);
  });

  // E-commerce queries
  bench('Ecommerce: Products by category', async () => {
    await neo4jSession.run(`
      MATCH (p:Product)
      RETURN p.category, count(p) as productCount, avg(p.price) as avgPrice
      ORDER BY productCount DESC
    `);
  });

  bench('Ecommerce: Top rated products', async () => {
    await neo4jSession.run(`
      MATCH (c:Customer)-[r:REVIEWED]->(p:Product)
      RETURN p.name, avg(r.rating) as avgRating, count(r) as reviewCount
      ORDER BY avgRating DESC
      LIMIT 10
    `);
  });

  bench('Ecommerce: Customer order totals', async () => {
    await neo4jSession.run(`
      MATCH (c:Customer)-[:PLACED]->(o:Order)
      RETURN c.name, c.tier, sum(o.total) as totalSpent, count(o) as orderCount
      ORDER BY totalSpent DESC
      LIMIT 10
    `);
  });

  bench('Ecommerce: Revenue by customer tier', async () => {
    await neo4jSession.run(`
      MATCH (c:Customer)-[:PLACED]->(o:Order)
      RETURN c.tier, sum(o.total) as revenue, count(o) as orders, avg(o.total) as avgOrder
      ORDER BY revenue DESC
    `);
  });

  bench('Ecommerce: Low stock expensive products', async () => {
    await neo4jSession.run(`
      MATCH (p:Product)
      WHERE p.stock < 100 AND p.price > 500
      RETURN p.name, p.price, p.stock, p.category
      ORDER BY p.stock ASC
    `);
  });

  // Complex queries
  bench('Complex: Multi-aggregation', async () => {
    await neo4jSession.run(`
      MATCH (p:Product)
      RETURN 
        p.category,
        count(p) as products,
        sum(p.price) as totalValue,
        avg(p.price) as avgPrice,
        min(p.price) as minPrice,
        max(p.price) as maxPrice
      ORDER BY totalValue DESC
    `);
  });

  bench('Complex: Large result set (500 rows)', async () => {
    await neo4jSession.run(`
      MATCH (a:Actor)-[:ACTED_IN]->(m:Movie)
      RETURN a.name, m.title, m.released
      LIMIT 500
    `);
  });

  bench('Write: Create and delete node', async () => {
    await neo4jSession.run(`
      CREATE (t:Temp {id: 99999, name: 'Benchmark Test'})
      WITH t
      DELETE t
    `);
  });

  bench('Write: Create and delete relationship', async () => {
    await neo4jSession.run(`
      MATCH (a:Actor), (m:Movie)
      WITH a, m LIMIT 1
      CREATE (a)-[r:TEMP_REL]->(m)
      DELETE r
    `);
  });
});
