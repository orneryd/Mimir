[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / orchestrator/workspace-context

# orchestrator/workspace-context

## Functions

### runWithWorkspaceContext()

> **runWithWorkspaceContext**\<`T`\>(`context`, `fn`): `Promise`\<`T`\>

Defined in: src/orchestrator/workspace-context.ts:144

Run a function with workspace context using AsyncLocalStorage

Establishes a workspace context for the duration of the function execution.
The context is automatically propagated through all async calls without
needing to pass it explicitly as a parameter.

This is particularly useful for:
- Setting working directory for tool execution
- Tracking session IDs across async operations
- Passing metadata without polluting function signatures

When running in Docker, automatically translates host paths to container paths.

#### Type Parameters

##### T

`T`

#### Parameters

##### context

`WorkspaceContext`

Workspace context with working directory and optional metadata

##### fn

() => `T` \| `Promise`\<`T`\>

Function to execute with the context

#### Returns

`Promise`\<`T`\>

Promise resolving to the function's return value

#### Example

```ts
// Basic usage with working directory
await runWithWorkspaceContext(
  { workingDirectory: '/Users/john/src/project' },
  async () => {
    const cwd = getWorkingDirectory();
    console.log(cwd); // '/workspace/project' (if in Docker)
    await agent.execute('Create README.md');
  }
);

// With session tracking
await runWithWorkspaceContext(
  {
    workingDirectory: '/workspace/project',
    sessionId: 'session-123',
    metadata: { userId: 'user-456' }
  },
  async () => {
    const ctx = getWorkspaceContext();
    console.log(ctx.sessionId); // 'session-123'
  }
);

// Nested contexts (inner context takes precedence)
await runWithWorkspaceContext(
  { workingDirectory: '/workspace/outer' },
  async () => {
    await runWithWorkspaceContext(
      { workingDirectory: '/workspace/inner' },
      async () => {
        console.log(getWorkingDirectory()); // '/workspace/inner'
      }
    );
  }
);
```

***

### getWorkspaceContext()

> **getWorkspaceContext**(): `WorkspaceContext` \| `undefined`

Defined in: src/orchestrator/workspace-context.ts:179

Get current workspace context from AsyncLocalStorage

Retrieves the workspace context established by runWithWorkspaceContext.
Returns undefined if no context is currently active.

This is useful for tools that need to access workspace metadata
without having it passed explicitly as parameters.

#### Returns

`WorkspaceContext` \| `undefined`

Current workspace context, or undefined if not in a context

#### Example

```ts
const context = getWorkspaceContext();
if (context) {
  console.log('Working in:', context.workingDirectory);
  console.log('Session:', context.sessionId);
} else {
  console.log('No workspace context active');
}
```

***

### getWorkingDirectory()

> **getWorkingDirectory**(): `string`

Defined in: src/orchestrator/workspace-context.ts:210

Get working directory for tool execution

Returns the working directory from the current workspace context,
or falls back to process.cwd() if no context is active.

When running in Docker, paths are automatically translated to
container paths by runWithWorkspaceContext.

#### Returns

`string`

Working directory path (container path if in Docker)

#### Example

```ts
// Inside a workspace context
await runWithWorkspaceContext(
  { workingDirectory: '/workspace/project' },
  async () => {
    const cwd = getWorkingDirectory();
    console.log(cwd); // '/workspace/project'
  }
);

// Outside a workspace context
const cwd = getWorkingDirectory();
console.log(cwd); // process.cwd()
```

***

### hasWorkspaceContext()

> **hasWorkspaceContext**(): `boolean`

Defined in: src/orchestrator/workspace-context.ts:229

Check if currently running within a workspace context

#### Returns

`boolean`

true if inside a runWithWorkspaceContext call, false otherwise

#### Example

```ts
if (hasWorkspaceContext()) {
  console.log('Using workspace:', getWorkingDirectory());
} else {
  console.log('No workspace context - using cwd');
}
```

***

### isRunningInDocker()

> **isRunningInDocker**(): `boolean`

Defined in: src/orchestrator/workspace-context.ts:251

Check if the application is running inside a Docker container

Detects Docker environment by checking for WORKSPACE_ROOT environment variable,
which is set in the Docker container configuration.

#### Returns

`boolean`

true if running in Docker, false if running locally

#### Example

```ts
if (isRunningInDocker()) {
  console.log('Running in container');
  console.log('Container workspace:', process.env.WORKSPACE_ROOT);
} else {
  console.log('Running locally');
}
```
