/**
 * LDBC-Style Social Network Benchmark for NornicDB vs Neo4j
 * 
 * Based on the industry-standard LDBC Social Network Benchmark (SNB):
 * https://github.com/ldbc/ldbc_snb_docs
 * 
 * Scale Factors:
 *   SF0.1: ~1K persons, ~10K messages, ~50K relationships
 *   SF1:   ~10K persons, ~100K messages, ~500K relationships  
 *   SF10:  ~100K persons, ~1M messages, ~5M relationships
 * 
 * This benchmark tests:
 * - Complex read queries (interactive short/complex)
 * - Update operations
 * - Multi-hop traversals
 * - Aggregations at scale
 * 
 * Run with: npm run bench:ldbc
 */

import { bench, describe, beforeAll, afterAll } from 'vitest';
import neo4j, { Driver, Session } from 'neo4j-driver';

// =============================================================================
// CONFIGURATION
// =============================================================================

const NORNICDB_URI = process.env.NORNICDB_URI || 'bolt://localhost:7687';
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7688';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

// Scale Factor: SF0.1 for quick tests, SF1 for comprehensive, SF10 for stress
const SCALE_FACTOR = parseFloat(process.env.SCALE_FACTOR || '0.1');

let nornicdbDriver: Driver;
let nornicdbSession: Session;
let neo4jDriver: Driver;
let neo4jSession: Session;

// =============================================================================
// LDBC DATA MODEL (Simplified)
// =============================================================================
// Person -[KNOWS]-> Person
// Person -[LIKES]-> Post/Comment
// Person -[HAS_INTEREST]-> Tag
// Person -[WORKS_AT]-> Company
// Person -[STUDIES_AT]-> University
// Person -[IS_LOCATED_IN]-> City
// Post -[HAS_CREATOR]-> Person
// Post -[HAS_TAG]-> Tag
// Comment -[REPLY_OF]-> Post/Comment
// City -[IS_PART_OF]-> Country
// Country -[IS_PART_OF]-> Continent

// =============================================================================
// DATA GENERATORS
// =============================================================================

const firstNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack',
  'Kate', 'Leo', 'Mia', 'Noah', 'Olivia', 'Peter', 'Quinn', 'Rose', 'Sam', 'Tina',
  'Uma', 'Victor', 'Wendy', 'Xavier', 'Yara', 'Zack', 'Anna', 'Ben', 'Cara', 'Dan'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Taylor',
  'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Thompson', 'Moore', 'Allen', 'Young'];
const countries = ['USA', 'UK', 'Germany', 'France', 'Japan', 'China', 'Brazil', 'India', 'Canada', 'Australia'];
const cities = ['New York', 'London', 'Berlin', 'Paris', 'Tokyo', 'Beijing', 'São Paulo', 'Mumbai', 'Toronto', 'Sydney',
  'Los Angeles', 'Manchester', 'Munich', 'Lyon', 'Osaka', 'Shanghai', 'Rio', 'Delhi', 'Vancouver', 'Melbourne'];
const companies = ['TechCorp', 'DataSoft', 'CloudInc', 'AILabs', 'WebDev', 'MobileTech', 'SecureNet', 'GreenEnergy', 'FinTech', 'HealthIT'];
const universities = ['MIT', 'Stanford', 'Harvard', 'Oxford', 'Cambridge', 'ETH', 'Caltech', 'Princeton', 'Yale', 'Berkeley'];
const tags = ['tech', 'science', 'music', 'sports', 'travel', 'food', 'art', 'politics', 'business', 'health',
  'AI', 'blockchain', 'cloud', 'mobile', 'gaming', 'movies', 'books', 'fashion', 'nature', 'photography'];

function getScaledCount(base: number): number {
  return Math.max(10, Math.floor(base * SCALE_FACTOR));
}

async function generateLDBCData(s: Session, dbName: string) {
  const personCount = getScaledCount(10000);
  const postCount = getScaledCount(100000);
  const commentCount = getScaledCount(50000);
  const knowsCount = getScaledCount(500000);
  
  console.log(`  Generating LDBC data for ${dbName} (SF${SCALE_FACTOR}):`);
  console.log(`    - ${personCount} persons`);
  console.log(`    - ${postCount} posts`);
  console.log(`    - ${commentCount} comments`);
  console.log(`    - ~${knowsCount} relationships`);
  
  // Create Places (Countries and Cities)
  console.log(`    → Creating places...`);
  for (let i = 0; i < countries.length; i++) {
    await s.run('CREATE (c:Country {id: $id, name: $name})', { id: i, name: countries[i] });
  }
  for (let i = 0; i < cities.length; i++) {
    await s.run(
      `CREATE (c:City {id: $cityId, name: $cityName})
       WITH c
       MATCH (country:Country {id: $countryId})
       CREATE (c)-[:IS_PART_OF]->(country)`,
      { cityId: i, cityName: cities[i], countryId: i % countries.length }
    );
  }
  
  // Create Organizations
  console.log(`    → Creating organizations...`);
  for (let i = 0; i < companies.length; i++) {
    await s.run('CREATE (c:Company {id: $id, name: $name})', { id: i, name: companies[i] });
  }
  for (let i = 0; i < universities.length; i++) {
    await s.run('CREATE (u:University {id: $id, name: $name})', { id: i, name: universities[i] });
  }
  
  // Create Tags
  console.log(`    → Creating tags...`);
  for (let i = 0; i < tags.length; i++) {
    await s.run('CREATE (t:Tag {id: $id, name: $name})', { id: i, name: tags[i] });
  }
  
  // Create Persons with relationships
  console.log(`    → Creating ${personCount} persons...`);
  for (let i = 0; i < personCount; i++) {
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[Math.floor(i / firstNames.length) % lastNames.length];
    const birthday = `19${70 + (i % 30)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
    const creationDate = `202${i % 4}-${String((i % 12) + 1).padStart(2, '0')}-01T12:00:00`;
    
    await s.run(
      `CREATE (p:Person {id: $id, firstName: $firstName, lastName: $lastName, gender: $gender, birthday: $birthday, creationDate: $creationDate, browserUsed: $browser, locationIP: $ip})
       WITH p
       MATCH (city:City {id: $cityId})
       CREATE (p)-[:IS_LOCATED_IN]->(city)`,
      {
        id: i,
        firstName,
        lastName,
        gender: i % 2 === 0 ? 'male' : 'female',
        birthday,
        creationDate,
        browser: ['Chrome', 'Firefox', 'Safari', 'Edge'][i % 4],
        ip: `192.168.${i % 256}.${(i * 7) % 256}`,
        cityId: i % cities.length
      }
    );
    
    // Add work/study relationships for some persons
    if (i % 3 === 0) {
      await s.run(
        `MATCH (p:Person {id: $personId}), (c:Company {id: $companyId})
         CREATE (p)-[:WORKS_AT {workFrom: $workFrom}]->(c)`,
        { personId: i, companyId: i % companies.length, workFrom: 2010 + (i % 14) }
      );
    }
    if (i % 4 === 0) {
      await s.run(
        `MATCH (p:Person {id: $personId}), (u:University {id: $uniId})
         CREATE (p)-[:STUDIES_AT {classYear: $classYear}]->(u)`,
        { personId: i, uniId: i % universities.length, classYear: 2005 + (i % 15) }
      );
    }
    
    // Add interests
    const interestCount = 1 + (i % 5);
    for (let j = 0; j < interestCount; j++) {
      await s.run(
        `MATCH (p:Person {id: $personId}), (t:Tag {id: $tagId})
         CREATE (p)-[:HAS_INTEREST]->(t)`,
        { personId: i, tagId: (i + j) % tags.length }
      );
    }
    
    // Progress indicator
    if (i > 0 && i % 500 === 0) {
      console.log(`      ${i}/${personCount} persons created...`);
    }
  }
  
  // Create KNOWS relationships (social network)
  console.log(`    → Creating KNOWS relationships...`);
  const actualKnowsCount = Math.min(knowsCount, personCount * 50); // Cap at 50 friends avg
  const seen = new Set<string>();
  let created = 0;
  
  for (let i = 0; created < actualKnowsCount && i < actualKnowsCount * 2; i++) {
    const person1 = Math.floor(Math.random() * personCount);
    const person2 = Math.floor(Math.random() * personCount);
    if (person1 === person2) continue;
    
    const key = person1 < person2 ? `${person1}-${person2}` : `${person2}-${person1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    
    await s.run(
      `MATCH (p1:Person {id: $p1}), (p2:Person {id: $p2})
       CREATE (p1)-[:KNOWS {creationDate: $date}]->(p2)`,
      { p1: person1, p2: person2, date: `202${i % 4}-${String((i % 12) + 1).padStart(2, '0')}-15` }
    );
    created++;
    
    if (created % 2000 === 0) {
      console.log(`      ${created}/${actualKnowsCount} KNOWS created...`);
    }
  }
  
  // Create Posts
  console.log(`    → Creating ${postCount} posts...`);
  for (let i = 0; i < postCount; i++) {
    const creatorId = i % personCount;
    await s.run(
      `MATCH (p:Person {id: $creatorId})
       CREATE (post:Post {id: $postId, imageFile: $image, creationDate: $date, browserUsed: $browser, locationIP: $ip, content: $content, length: $length})
       CREATE (post)-[:HAS_CREATOR]->(p)`,
      {
        postId: i,
        creatorId,
        image: i % 5 === 0 ? `image${i}.jpg` : null,
        date: `202${i % 4}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
        browser: ['Chrome', 'Firefox', 'Safari', 'Edge'][i % 4],
        ip: `10.0.${i % 256}.${(i * 3) % 256}`,
        content: `Post content ${i} - Lorem ipsum dolor sit amet...`,
        length: 50 + (i % 200)
      }
    );
    
    // Add tags to posts
    const tagCount = 1 + (i % 3);
    for (let j = 0; j < tagCount; j++) {
      await s.run(
        `MATCH (post:Post {id: $postId}), (t:Tag {id: $tagId})
         CREATE (post)-[:HAS_TAG]->(t)`,
        { postId: i, tagId: (i + j) % tags.length }
      );
    }
    
    if (i > 0 && i % 1000 === 0) {
      console.log(`      ${i}/${postCount} posts created...`);
    }
  }
  
  // Create Comments
  console.log(`    → Creating ${commentCount} comments...`);
  for (let i = 0; i < commentCount; i++) {
    const creatorId = (i * 3) % personCount;
    const replyToPost = i % postCount;
    
    await s.run(
      `MATCH (p:Person {id: $creatorId}), (post:Post {id: $postId})
       CREATE (c:Comment {id: $commentId, creationDate: $date, content: $content, length: $length})
       CREATE (c)-[:HAS_CREATOR]->(p)
       CREATE (c)-[:REPLY_OF]->(post)`,
      {
        commentId: i,
        creatorId,
        postId: replyToPost,
        date: `202${i % 4}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
        content: `Comment ${i} - Great post!`,
        length: 20 + (i % 100)
      }
    );
    
    if (i > 0 && i % 1000 === 0) {
      console.log(`      ${i}/${commentCount} comments created...`);
    }
  }
  
  // Create LIKES relationships
  console.log(`    → Creating LIKES relationships...`);
  const likesCount = getScaledCount(200000);
  for (let i = 0; i < likesCount; i++) {
    const personId = i % personCount;
    const postId = (i * 7) % postCount;
    
    await s.run(
      `MATCH (p:Person {id: $personId}), (post:Post {id: $postId})
       CREATE (p)-[:LIKES {creationDate: $date}]->(post)`,
      { personId, postId, date: `202${i % 4}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}` }
    );
    
    if (i > 0 && i % 2000 === 0) {
      console.log(`      ${i}/${likesCount} LIKES created...`);
    }
  }
  
  // Verify counts
  const nodeCount = await s.run('MATCH (n) RETURN count(n) as c');
  const edgeCount = await s.run('MATCH ()-[r]->() RETURN count(r) as c');
  console.log(`  ✓ ${dbName}: ${nodeCount.records[0].get('c')} nodes, ${edgeCount.records[0].get('c')} relationships\n`);
}

// =============================================================================
// SETUP AND TEARDOWN
// =============================================================================

beforeAll(async () => {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║   LDBC-Style Social Network Benchmark - NornicDB vs Neo4j         ║');
  console.log(`║   Scale Factor: SF${SCALE_FACTOR}                                              ║`);
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');
  
  // Connect to NornicDB
  console.log(`Connecting to NornicDB at ${NORNICDB_URI}...`);
  try {
    nornicdbDriver = neo4j.driver(NORNICDB_URI);
    nornicdbSession = nornicdbDriver.session();
    await nornicdbSession.run('RETURN 1');
    console.log('✓ Connected to NornicDB\n');
    
    await nornicdbSession.run('MATCH (n) DETACH DELETE n');
    await generateLDBCData(nornicdbSession, 'NornicDB');
  } catch (error) {
    console.error('✗ NornicDB error:', error);
  }
  
  // Connect to Neo4j
  console.log(`Connecting to Neo4j at ${NEO4J_URI}...`);
  try {
    neo4jDriver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    neo4jSession = neo4jDriver.session();
    await neo4jSession.run('RETURN 1');
    console.log('✓ Connected to Neo4j\n');
    
    await neo4jSession.run('MATCH (n) DETACH DELETE n');
    await generateLDBCData(neo4jSession, 'Neo4j');
  } catch (error) {
    console.error('✗ Neo4j error:', error);
  }
  
  console.log('─'.repeat(72) + '\n');
}, 1800000); // 30 minute timeout for large datasets

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
}, 60000);

// =============================================================================
// LDBC INTERACTIVE SHORT QUERIES (IS)
// =============================================================================

describe('NornicDB - LDBC Interactive', () => {
  
  // IS1: Profile of a person
  bench('IS1: Person profile', async () => {
    await nornicdbSession.run(`
      MATCH (p:Person {id: 1})
      RETURN p.firstName, p.lastName, p.birthday, p.locationIP, p.browserUsed, p.gender, p.creationDate
    `);
  });
  
  // IS2: Recent messages of a person
  bench('IS2: Recent messages', async () => {
    await nornicdbSession.run(`
      MATCH (p:Person {id: 1})<-[:HAS_CREATOR]-(m)
      WHERE m:Post OR m:Comment
      RETURN m.id, m.content, m.creationDate
      ORDER BY m.creationDate DESC
      LIMIT 10
    `);
  });
  
  // IS3: Friends of a person
  bench('IS3: Friends', async () => {
    await nornicdbSession.run(`
      MATCH (p:Person {id: 1})-[:KNOWS]-(friend:Person)
      RETURN friend.id, friend.firstName, friend.lastName
    `);
  });
  
  // IS4: Content of a message
  bench('IS4: Message content', async () => {
    await nornicdbSession.run(`
      MATCH (m:Post {id: 100})
      RETURN m.content, m.creationDate
    `);
  });
  
  // IS5: Creator of a message
  bench('IS5: Message creator', async () => {
    await nornicdbSession.run(`
      MATCH (m:Post {id: 100})-[:HAS_CREATOR]->(p:Person)
      RETURN p.id, p.firstName, p.lastName
    `);
  });
  
  // IS6: Forum of a message (adapted - tags instead)
  bench('IS6: Message tags', async () => {
    await nornicdbSession.run(`
      MATCH (m:Post {id: 100})-[:HAS_TAG]->(t:Tag)
      RETURN t.name
    `);
  });
  
  // IS7: Replies to a message
  bench('IS7: Message replies', async () => {
    await nornicdbSession.run(`
      MATCH (m:Post {id: 100})<-[:REPLY_OF]-(c:Comment)-[:HAS_CREATOR]->(p:Person)
      RETURN c.id, c.content, p.firstName, p.lastName
      ORDER BY c.creationDate DESC
    `);
  });

  // Complex queries
  bench('IC1: Friends with name', async () => {
    await nornicdbSession.run(`
      MATCH (p:Person {id: 1})-[:KNOWS*1..3]-(friend:Person)
      WHERE friend.firstName = 'Alice'
      RETURN DISTINCT friend.id, friend.lastName
      LIMIT 20
    `);
  });
  
  bench('IC2: Recent messages from friends', async () => {
    await nornicdbSession.run(`
      MATCH (p:Person {id: 1})-[:KNOWS]-(friend:Person)<-[:HAS_CREATOR]-(m)
      WHERE m:Post OR m:Comment
      RETURN friend.firstName, m.content, m.creationDate
      ORDER BY m.creationDate DESC
      LIMIT 20
    `);
  });
  
  bench('IC3: Friends in countries', async () => {
    await nornicdbSession.run(`
      MATCH (p:Person {id: 1})-[:KNOWS*1..2]-(friend:Person)-[:IS_LOCATED_IN]->(city:City)-[:IS_PART_OF]->(country:Country)
      WHERE country.name IN ['USA', 'UK', 'Germany']
      RETURN friend.firstName, friend.lastName, country.name, count(*) as cnt
      ORDER BY cnt DESC
      LIMIT 20
    `);
  });
  
  bench('IC4: Popular tags among friends', async () => {
    await nornicdbSession.run(`
      MATCH (p:Person {id: 1})-[:KNOWS]-(friend:Person)-[:HAS_INTEREST]->(t:Tag)
      RETURN t.name, count(*) as popularity
      ORDER BY popularity DESC
      LIMIT 10
    `);
  });
  
  bench('IC5: New groups (friends of friends)', async () => {
    await nornicdbSession.run(`
      MATCH (p:Person {id: 1})-[:KNOWS]->(friend:Person)-[:KNOWS]->(fof:Person)
      WHERE NOT (p)-[:KNOWS]-(fof) AND p <> fof
      RETURN DISTINCT fof.firstName, fof.lastName
      LIMIT 20
    `);
  });

  // Aggregation queries
  bench('Agg: Posts per person', async () => {
    await nornicdbSession.run(`
      MATCH (p:Person)<-[:HAS_CREATOR]-(post:Post)
      RETURN p.id, count(post) as postCount
      ORDER BY postCount DESC
      LIMIT 10
    `);
  });
  
  bench('Agg: Average friends per city', async () => {
    await nornicdbSession.run(`
      MATCH (p:Person)-[:IS_LOCATED_IN]->(city:City)
      OPTIONAL MATCH (p)-[:KNOWS]-(friend)
      WITH city, p, count(friend) as friendCount
      RETURN city.name, avg(friendCount) as avgFriends, count(p) as personCount
      ORDER BY avgFriends DESC
    `);
  });
  
  bench('Agg: Tag co-occurrence', async () => {
    await nornicdbSession.run(`
      MATCH (post:Post)-[:HAS_TAG]->(t1:Tag), (post)-[:HAS_TAG]->(t2:Tag)
      WHERE t1.id < t2.id
      RETURN t1.name, t2.name, count(*) as coCount
      ORDER BY coCount DESC
      LIMIT 10
    `);
  });

  // Write operations
  bench('Write: Create and delete person', async () => {
    await nornicdbSession.run(`
      CREATE (p:Person {id: 999999, firstName: 'Test', lastName: 'User'})
      WITH p
      DELETE p
    `);
  });
  
  bench('Write: Create and delete KNOWS', async () => {
    await nornicdbSession.run(`
      MATCH (p1:Person {id: 1}), (p2:Person {id: 2})
      CREATE (p1)-[r:TEMP_KNOWS]->(p2)
      DELETE r
    `);
  });
});

// =============================================================================
// NEO4J BENCHMARKS (Same queries)
// =============================================================================

describe('Neo4j - LDBC Interactive', () => {
  
  bench('IS1: Person profile', async () => {
    await neo4jSession.run(`
      MATCH (p:Person {id: 1})
      RETURN p.firstName, p.lastName, p.birthday, p.locationIP, p.browserUsed, p.gender, p.creationDate
    `);
  });
  
  bench('IS2: Recent messages', async () => {
    await neo4jSession.run(`
      MATCH (p:Person {id: 1})<-[:HAS_CREATOR]-(m)
      WHERE m:Post OR m:Comment
      RETURN m.id, m.content, m.creationDate
      ORDER BY m.creationDate DESC
      LIMIT 10
    `);
  });
  
  bench('IS3: Friends', async () => {
    await neo4jSession.run(`
      MATCH (p:Person {id: 1})-[:KNOWS]-(friend:Person)
      RETURN friend.id, friend.firstName, friend.lastName
    `);
  });
  
  bench('IS4: Message content', async () => {
    await neo4jSession.run(`
      MATCH (m:Post {id: 100})
      RETURN m.content, m.creationDate
    `);
  });
  
  bench('IS5: Message creator', async () => {
    await neo4jSession.run(`
      MATCH (m:Post {id: 100})-[:HAS_CREATOR]->(p:Person)
      RETURN p.id, p.firstName, p.lastName
    `);
  });
  
  bench('IS6: Message tags', async () => {
    await neo4jSession.run(`
      MATCH (m:Post {id: 100})-[:HAS_TAG]->(t:Tag)
      RETURN t.name
    `);
  });
  
  bench('IS7: Message replies', async () => {
    await neo4jSession.run(`
      MATCH (m:Post {id: 100})<-[:REPLY_OF]-(c:Comment)-[:HAS_CREATOR]->(p:Person)
      RETURN c.id, c.content, p.firstName, p.lastName
      ORDER BY c.creationDate DESC
    `);
  });

  bench('IC1: Friends with name', async () => {
    await neo4jSession.run(`
      MATCH (p:Person {id: 1})-[:KNOWS*1..3]-(friend:Person)
      WHERE friend.firstName = 'Alice'
      RETURN DISTINCT friend.id, friend.lastName
      LIMIT 20
    `);
  });
  
  bench('IC2: Recent messages from friends', async () => {
    await neo4jSession.run(`
      MATCH (p:Person {id: 1})-[:KNOWS]-(friend:Person)<-[:HAS_CREATOR]-(m)
      WHERE m:Post OR m:Comment
      RETURN friend.firstName, m.content, m.creationDate
      ORDER BY m.creationDate DESC
      LIMIT 20
    `);
  });
  
  bench('IC3: Friends in countries', async () => {
    await neo4jSession.run(`
      MATCH (p:Person {id: 1})-[:KNOWS*1..2]-(friend:Person)-[:IS_LOCATED_IN]->(city:City)-[:IS_PART_OF]->(country:Country)
      WHERE country.name IN ['USA', 'UK', 'Germany']
      RETURN friend.firstName, friend.lastName, country.name, count(*) as cnt
      ORDER BY cnt DESC
      LIMIT 20
    `);
  });
  
  bench('IC4: Popular tags among friends', async () => {
    await neo4jSession.run(`
      MATCH (p:Person {id: 1})-[:KNOWS]-(friend:Person)-[:HAS_INTEREST]->(t:Tag)
      RETURN t.name, count(*) as popularity
      ORDER BY popularity DESC
      LIMIT 10
    `);
  });
  
  bench('IC5: New groups (friends of friends)', async () => {
    await neo4jSession.run(`
      MATCH (p:Person {id: 1})-[:KNOWS]->(friend:Person)-[:KNOWS]->(fof:Person)
      WHERE NOT (p)-[:KNOWS]-(fof) AND p <> fof
      RETURN DISTINCT fof.firstName, fof.lastName
      LIMIT 20
    `);
  });

  bench('Agg: Posts per person', async () => {
    await neo4jSession.run(`
      MATCH (p:Person)<-[:HAS_CREATOR]-(post:Post)
      RETURN p.id, count(post) as postCount
      ORDER BY postCount DESC
      LIMIT 10
    `);
  });
  
  bench('Agg: Average friends per city', async () => {
    await neo4jSession.run(`
      MATCH (p:Person)-[:IS_LOCATED_IN]->(city:City)
      OPTIONAL MATCH (p)-[:KNOWS]-(friend)
      WITH city, p, count(friend) as friendCount
      RETURN city.name, avg(friendCount) as avgFriends, count(p) as personCount
      ORDER BY avgFriends DESC
    `);
  });
  
  bench('Agg: Tag co-occurrence', async () => {
    await neo4jSession.run(`
      MATCH (post:Post)-[:HAS_TAG]->(t1:Tag), (post)-[:HAS_TAG]->(t2:Tag)
      WHERE t1.id < t2.id
      RETURN t1.name, t2.name, count(*) as coCount
      ORDER BY coCount DESC
      LIMIT 10
    `);
  });

  bench('Write: Create and delete person', async () => {
    await neo4jSession.run(`
      CREATE (p:Person {id: 999999, firstName: 'Test', lastName: 'User'})
      WITH p
      DELETE p
    `);
  });
  
  bench('Write: Create and delete KNOWS', async () => {
    await neo4jSession.run(`
      MATCH (p1:Person {id: 1}), (p2:Person {id: 2})
      CREATE (p1)-[r:TEMP_KNOWS]->(p2)
      DELETE r
    `);
  });
});
