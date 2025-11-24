[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / orchestrator/ConversationHistoryManager

# orchestrator/ConversationHistoryManager

## Classes

### ConversationHistoryManager

Defined in: src/orchestrator/ConversationHistoryManager.ts:44

#### Constructors

##### Constructor

> **new ConversationHistoryManager**(`driver`): [`ConversationHistoryManager`](#conversationhistorymanager)

Defined in: src/orchestrator/ConversationHistoryManager.ts:54

###### Parameters

###### driver

`Driver`

###### Returns

[`ConversationHistoryManager`](#conversationhistorymanager)

#### Methods

##### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: src/orchestrator/ConversationHistoryManager.ts:82

Initialize the conversation history system

Sets up vector embeddings service and creates necessary Neo4j indexes
for conversation message storage and retrieval.

Must be called before using any other methods. Safe to call multiple times
(subsequent calls are no-ops).

###### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

###### Example

```ts
const driver = neo4j.driver('bolt://localhost:7687');
const manager = new ConversationHistoryManager(driver);

await manager.initialize();
// Output: ✅ ConversationHistoryManager: Vector-based retrieval enabled

// Now ready to store and retrieve messages
await manager.addMessage('session-1', 'user', 'How do I use Docker?');
```

##### storeMessage()

> **storeMessage**(`sessionId`, `role`, `content`, `metadata?`): `Promise`\<`string`\>

Defined in: src/orchestrator/ConversationHistoryManager.ts:210

Store a message in the conversation history

Saves a conversation message to Neo4j with automatic embedding
generation if the embeddings service is enabled and content
is substantial (>10 characters).

###### Parameters

###### sessionId

`string`

Unique session identifier

###### role

Message role (system/user/assistant/tool)

`"user"` | `"tool"` | `"system"` | `"assistant"`

###### content

`string`

Message content text

###### metadata?

`Record`\<`string`, `any`\>

Optional metadata object

###### Returns

`Promise`\<`string`\>

Promise resolving to generated message ID

###### Examples

```ts
// Store user message
const msgId = await manager.storeMessage(
  'session-123',
  'user',
  'How do I configure Docker volumes?'
);
console.log('Stored message:', msgId);
```

```ts
// Store assistant response with metadata
await manager.storeMessage(
  'session-123',
  'assistant',
  'To configure Docker volumes...',
  { model: 'gpt-4', tokens: 150 }
);
```

```ts
// Store system message
await manager.storeMessage(
  'session-123',
  'system',
  'You are a helpful Docker expert'
);
```

##### getRecentMessages()

> **getRecentMessages**(`sessionId`, `count`): `Promise`\<[`ConversationMessage`](#conversationmessage)[]\>

Defined in: src/orchestrator/ConversationHistoryManager.ts:284

Get recent N messages from a session

Retrieves the most recent messages from a conversation session
in chronological order. Used to maintain conversation context.

###### Parameters

###### sessionId

`string`

Session identifier

###### count

`number` = `10`

Number of recent messages to retrieve (default: 10)

###### Returns

`Promise`\<[`ConversationMessage`](#conversationmessage)[]\>

Promise resolving to array of messages in chronological order

###### Examples

```ts
// Get last 5 messages
const recent = await manager.getRecentMessages('session-123', 5);
recent.forEach(msg => {
  console.log(`${msg.role}: ${msg.content}`);
});
```

```ts
// Get default 10 recent messages
const messages = await manager.getRecentMessages('session-456');
console.log(`Retrieved ${messages.length} recent messages`);
```

##### retrieveRelevantMessages()

> **retrieveRelevantMessages**(`sessionId`, `query`, `count`, `minSimilarity`, `excludeRecentCount`): `Promise`\<[`RetrievedMessage`](#retrievedmessage)[]\>

Defined in: src/orchestrator/ConversationHistoryManager.ts:349

Retrieve semantically relevant messages for a new query

Uses vector similarity search to find past messages that are
semantically related to the current query. Excludes recent messages
to avoid duplication with getRecentMessages().

**Requires**: Embeddings service must be enabled

###### Parameters

###### sessionId

`string`

Session identifier

###### query

`string`

Current query text to find relevant context for

###### count

`number` = `10`

Max number of relevant messages to retrieve (default: 10)

###### minSimilarity

`number` = `0.70`

Minimum similarity score threshold (default: 0.70)

###### excludeRecentCount

`number` = `5`

Number of recent messages to exclude (default: 5)

###### Returns

`Promise`\<[`RetrievedMessage`](#retrievedmessage)[]\>

Promise resolving to array of relevant messages with similarity scores

###### Examples

```ts
// Find relevant past messages for current query
const relevant = await manager.retrieveRelevantMessages(
  'session-123',
  'How do I troubleshoot Docker networking?',
  10,
  0.75
);

relevant.forEach(msg => {
  console.log(`Similarity: ${msg.similarity.toFixed(2)}`);
  console.log(`${msg.role}: ${msg.content.substring(0, 100)}...`);
});
```

```ts
// Get highly relevant messages only
const highlyRelevant = await manager.retrieveRelevantMessages(
  'session-456',
  'authentication errors',
  5,
  0.85  // Higher threshold
);
```

##### buildConversationContext()

> **buildConversationContext**(`sessionId`, `systemPrompt`, `newQuery`, `options?`): `Promise`\<`BaseMessage`\<`MessageStructure`, `MessageType`\>[]\>

Defined in: src/orchestrator/ConversationHistoryManager.ts:467

Build complete conversation context for agent execution

Assembles a complete conversation context by combining:
1. System prompt
2. Semantically relevant past messages (if embeddings enabled)
3. Recent conversation messages
4. New user query

This implements the "Option 4" advanced retrieval strategy for
maintaining long conversation context without token overflow.

###### Parameters

###### sessionId

`string`

Session identifier

###### systemPrompt

`string`

System prompt/instructions

###### newQuery

`string`

New user query

###### options?

Optional configuration

###### recentCount?

`number`

Number of recent messages (default: 5)

###### retrievedCount?

`number`

Number of relevant messages (default: 10)

###### minSimilarity?

`number`

Similarity threshold (default: 0.70)

###### Returns

`Promise`\<`BaseMessage`\<`MessageStructure`, `MessageType`\>[]\>

Promise resolving to array of LangChain BaseMessage objects

###### Examples

```ts
// Build context for agent execution
const messages = await manager.buildConversationContext(
  'session-123',
  'You are a helpful Docker expert',
  'How do I configure volumes?'
);

// Use with LangChain agent
const response = await agent.invoke({ messages });
```

```ts
// Custom retrieval settings
const messages = await manager.buildConversationContext(
  'session-456',
  'You are a security consultant',
  'Explain OAuth flow',
  {
    recentCount: 3,
    retrievedCount: 15,
    minSimilarity: 0.80
  }
);

console.log(`Context includes ${messages.length} messages`);
```

##### storeConversationTurn()

> **storeConversationTurn**(`sessionId`, `userMessage`, `assistantResponse`, `metadata?`): `Promise`\<\{ `userMessageId`: `string`; `assistantMessageId`: `string`; \}\>

Defined in: src/orchestrator/ConversationHistoryManager.ts:559

Store complete conversation turn (user message + agent response)

Convenience method to store both user message and assistant response
in a single call. Generates embeddings for both messages if enabled.

###### Parameters

###### sessionId

`string`

Session identifier

###### userMessage

`string`

User's message text

###### assistantResponse

`string`

Assistant's response text

###### metadata?

`Record`\<`string`, `any`\>

Optional metadata for both messages

###### Returns

`Promise`\<\{ `userMessageId`: `string`; `assistantMessageId`: `string`; \}\>

Promise resolving to object with both message IDs

###### Examples

```ts
// Store complete Q&A turn
const { userMessageId, assistantMessageId } = 
  await manager.storeConversationTurn(
    'session-123',
    'How do I use Docker Compose?',
    'Docker Compose is a tool for defining...'
  );

console.log('Stored turn:', userMessageId, assistantMessageId);
```

```ts
// Store with metadata
await manager.storeConversationTurn(
  'session-456',
  'Explain OAuth',
  'OAuth is an authorization framework...',
  { model: 'gpt-4', duration_ms: 1250 }
);
```

##### clearSession()

> **clearSession**(`sessionId`): `Promise`\<`number`\>

Defined in: src/orchestrator/ConversationHistoryManager.ts:595

Delete all messages for a session

Permanently removes all conversation messages for the specified
session from the database. Useful for privacy compliance or
resetting conversations.

###### Parameters

###### sessionId

`string`

Session identifier to clear

###### Returns

`Promise`\<`number`\>

Promise resolving to number of messages deleted

###### Examples

```ts
// Clear session after completion
const deletedCount = await manager.clearSession('session-123');
console.log(`Deleted ${deletedCount} messages`);
```

```ts
// Clear multiple sessions
const sessions = ['session-1', 'session-2', 'session-3'];
for (const sessionId of sessions) {
  const count = await manager.clearSession(sessionId);
  console.log(`Cleared ${count} messages from ${sessionId}`);
}
```

##### getSessionStats()

> **getSessionStats**(`sessionId`): `Promise`\<\{ `totalMessages`: `number`; `userMessages`: `number`; `assistantMessages`: `number`; `embeddedMessages`: `number`; `oldestMessage`: `number` \| `null`; `newestMessage`: `number` \| `null`; \}\>

Defined in: src/orchestrator/ConversationHistoryManager.ts:648

Get conversation statistics for a session

Returns comprehensive statistics about a conversation session
including message counts, role distribution, and time range.

###### Parameters

###### sessionId

`string`

Session identifier

###### Returns

`Promise`\<\{ `totalMessages`: `number`; `userMessages`: `number`; `assistantMessages`: `number`; `embeddedMessages`: `number`; `oldestMessage`: `number` \| `null`; `newestMessage`: `number` \| `null`; \}\>

Promise resolving to statistics object

###### Examples

```ts
// Get session statistics
const stats = await manager.getSessionStats('session-123');
console.log(`Total messages: ${stats.totalMessages}`);
console.log(`User messages: ${stats.userMessages}`);
console.log(`Assistant messages: ${stats.assistantMessages}`);
console.log(`Embedded: ${stats.embeddedMessages}`);
```

```ts
// Check session age
const stats = await manager.getSessionStats('session-456');
if (stats.oldestMessage) {
  const ageHours = (Date.now() - stats.oldestMessage) / (1000 * 60 * 60);
  console.log(`Session age: ${ageHours.toFixed(1)} hours`);
}
```

```ts
// Monitor embedding coverage
const stats = await manager.getSessionStats('session-789');
const coverage = (stats.embeddedMessages / stats.totalMessages) * 100;
console.log(`Embedding coverage: ${coverage.toFixed(1)}%`);
```

## Interfaces

### ConversationMessage

Defined in: src/orchestrator/ConversationHistoryManager.ts:22

#### Extended by

- [`RetrievedMessage`](#retrievedmessage)

#### Properties

##### id

> **id**: `string`

Defined in: src/orchestrator/ConversationHistoryManager.ts:23

##### sessionId

> **sessionId**: `string`

Defined in: src/orchestrator/ConversationHistoryManager.ts:24

##### role

> **role**: `"user"` \| `"tool"` \| `"system"` \| `"assistant"`

Defined in: src/orchestrator/ConversationHistoryManager.ts:25

##### content

> **content**: `string`

Defined in: src/orchestrator/ConversationHistoryManager.ts:26

##### timestamp

> **timestamp**: `number`

Defined in: src/orchestrator/ConversationHistoryManager.ts:27

##### embedding?

> `optional` **embedding**: `number`[]

Defined in: src/orchestrator/ConversationHistoryManager.ts:28

##### metadata?

> `optional` **metadata**: `Record`\<`string`, `any`\>

Defined in: src/orchestrator/ConversationHistoryManager.ts:29

***

### RetrievedMessage

Defined in: src/orchestrator/ConversationHistoryManager.ts:32

#### Extends

- [`ConversationMessage`](#conversationmessage)

#### Properties

##### id

> **id**: `string`

Defined in: src/orchestrator/ConversationHistoryManager.ts:23

###### Inherited from

[`ConversationMessage`](#conversationmessage).[`id`](#id)

##### sessionId

> **sessionId**: `string`

Defined in: src/orchestrator/ConversationHistoryManager.ts:24

###### Inherited from

[`ConversationMessage`](#conversationmessage).[`sessionId`](#sessionid)

##### role

> **role**: `"user"` \| `"tool"` \| `"system"` \| `"assistant"`

Defined in: src/orchestrator/ConversationHistoryManager.ts:25

###### Inherited from

[`ConversationMessage`](#conversationmessage).[`role`](#role)

##### content

> **content**: `string`

Defined in: src/orchestrator/ConversationHistoryManager.ts:26

###### Inherited from

[`ConversationMessage`](#conversationmessage).[`content`](#content)

##### timestamp

> **timestamp**: `number`

Defined in: src/orchestrator/ConversationHistoryManager.ts:27

###### Inherited from

[`ConversationMessage`](#conversationmessage).[`timestamp`](#timestamp)

##### embedding?

> `optional` **embedding**: `number`[]

Defined in: src/orchestrator/ConversationHistoryManager.ts:28

###### Inherited from

[`ConversationMessage`](#conversationmessage).[`embedding`](#embedding)

##### metadata?

> `optional` **metadata**: `Record`\<`string`, `any`\>

Defined in: src/orchestrator/ConversationHistoryManager.ts:29

###### Inherited from

[`ConversationMessage`](#conversationmessage).[`metadata`](#metadata)

##### similarity

> **similarity**: `number`

Defined in: src/orchestrator/ConversationHistoryManager.ts:33

##### isRecent

> **isRecent**: `boolean`

Defined in: src/orchestrator/ConversationHistoryManager.ts:34

***

### ConversationContext

Defined in: src/orchestrator/ConversationHistoryManager.ts:37

#### Properties

##### systemMessage

> **systemMessage**: `BaseMessage`

Defined in: src/orchestrator/ConversationHistoryManager.ts:38

##### retrievedMessages

> **retrievedMessages**: `BaseMessage`\<`MessageStructure`, `MessageType`\>[]

Defined in: src/orchestrator/ConversationHistoryManager.ts:39

##### recentMessages

> **recentMessages**: `BaseMessage`\<`MessageStructure`, `MessageType`\>[]

Defined in: src/orchestrator/ConversationHistoryManager.ts:40

##### newMessage

> **newMessage**: `BaseMessage`

Defined in: src/orchestrator/ConversationHistoryManager.ts:41
