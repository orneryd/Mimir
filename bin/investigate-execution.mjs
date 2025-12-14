#!/usr/bin/env node
/**
 * Investigate workflow execution by querying NornicDB
 * Usage: node bin/investigate-execution.mjs <execution-id>
 *    or: npm run inv <execution-id>
 */
import neo4j from 'neo4j-driver';

const execId = process.argv[2];

if (!execId) {
  console.error('Usage: npm run inv <execution-id>');
  console.error('Example: npm run inv exec-1765670775819');
  process.exit(1);
}

// Load config from environment
const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
const user = process.env.NEO4J_USER || 'admin';
const password = process.env.NEO4J_PASSWORD || 'password';

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
const session = driver.session();

async function investigate() {
  console.log(`\n🔍 Investigating execution: ${execId}\n`);
  console.log('─'.repeat(60));

  try {
    // 1. Get execution summary
    const execResult = await session.run(`
      MATCH (n) WHERE n.id = $execId
      RETURN n.status as status, n.tasksFailed as failed, n.tasksSuccessful as success, 
             n.tasksTotal as total, n.startTime as startTime, n.endTime as endTime
    `, { execId });

    if (execResult.records.length > 0) {
      const r = execResult.records[0];
      console.log('\n📊 EXECUTION SUMMARY');
      console.log('─'.repeat(40));
      console.log(`Status: ${r.get('status')}`);
      console.log(`Tasks: ${r.get('success')}/${r.get('total')} successful, ${r.get('failed')} failed`);
      console.log(`Start: ${r.get('startTime')}`);
      console.log(`End: ${r.get('endTime')}`);
    } else {
      console.log(`❌ Execution ${execId} not found`);
    }

    // 2. Get all task executions for this specific execution (filter by executionId)
    const tasksResult = await session.run(`
      MATCH (n) WHERE n.executionId = $execId AND n.taskId IS NOT NULL
      RETURN n.taskId as taskId, n.title as title, n.status as status, 
             n.output as output, n.type as type, n.error as error,
             n.qcFeedback as qcFeedback, n.created as created
      ORDER BY n.created DESC
      LIMIT 20
    `, { execId });

    if (tasksResult.records.length > 0) {
      console.log('\n\n📋 TASK DETAILS');
      console.log('─'.repeat(40));
      
      for (const record of tasksResult.records) {
        const type = record.get('type');
        if (type === 'orchestration_execution') continue; // Skip the main execution node
        
        const taskId = record.get('taskId');
        const title = record.get('title');
        const status = record.get('status');
        const output = record.get('output');

        if (taskId) {
          console.log(`\n🔹 Task: ${title || taskId}`);
          console.log(`   ID: ${taskId}`);
          console.log(`   Status: ${status || 'unknown'}`);
          
          if (output) {
            console.log(`   Output:`);
            try {
              const parsed = JSON.parse(output);
              console.log(JSON.stringify(parsed, null, 2).split('\n').map(l => '      ' + l).join('\n'));
            } catch {
              console.log(`      ${output.substring(0, 500)}${output.length > 500 ? '...' : ''}`);
            }
          }
        }
      }
    }

    // 3. Search for any nodes related to this execution by partial match
    const relatedResult = await session.run(`
      MATCH (n) WHERE n.id CONTAINS $execId AND n.output IS NOT NULL
      RETURN n.id as id, n.output as output, n.status as status
      LIMIT 10
    `, { execId });

    if (relatedResult.records.length > 0) {
      console.log('\n\n📎 RELATED NODES WITH OUTPUT');
      console.log('─'.repeat(40));
      
      for (const record of relatedResult.records) {
        const id = record.get('id');
        const output = record.get('output');
        const status = record.get('status');
        
        if (typeof id === 'string') {
          console.log(`\n🔸 ${id} (${status})`);
          if (output) {
            try {
              const parsed = JSON.parse(output);
              if (parsed.error) {
                console.log(`   ❌ Error: ${parsed.error}`);
              } else {
                console.log(JSON.stringify(parsed, null, 2).split('\n').slice(0, 10).map(l => '   ' + l).join('\n'));
                if (JSON.stringify(parsed, null, 2).split('\n').length > 10) {
                  console.log('   ... (truncated)');
                }
              }
            } catch {
              console.log(`   ${output.substring(0, 300)}${output.length > 300 ? '...' : ''}`);
            }
          }
        }
      }
    }

  } catch (error) {
    console.error(`❌ Query failed: ${error.message}`);
  } finally {
    await session.close();
    await driver.close();
  }

  console.log('\n' + '─'.repeat(60) + '\n');
}

investigate();
