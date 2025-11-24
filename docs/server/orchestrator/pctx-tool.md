[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / orchestrator/pctx-tool

# orchestrator/pctx-tool

## Functions

### createPCTXTool()

> **createPCTXTool**(`pctxUrl`): `DynamicStructuredTool`\<`ZodObject`\<\{ `code`: `ZodString`; \}, `$strip`\>, \{ `code`: `string`; \}, \{ `code`: `string`; \}, `any`\>

Defined in: src/orchestrator/pctx-tool.ts:22

Create PCTX execution tool

This tool allows agents to write TypeScript code that executes in PCTX's Deno sandbox.
The code has access to all Mimir functions via the `Mimir` namespace.

Benefits:
- 90-98% token reduction for multi-step operations
- Type-safe TypeScript execution
- All 13 Mimir tools available
- Batch operations in single call

#### Parameters

##### pctxUrl

`string`

#### Returns

`DynamicStructuredTool`\<`ZodObject`\<\{ `code`: `ZodString`; \}, `$strip`\>, \{ `code`: `string`; \}, \{ `code`: `string`; \}, `any`\>

***

### isPCTXAvailable()

> **isPCTXAvailable**(`pctxUrl?`): `Promise`\<`boolean`\>

Defined in: src/orchestrator/pctx-tool.ts:132

Check if PCTX is configured and available

#### Parameters

##### pctxUrl?

`string`

#### Returns

`Promise`\<`boolean`\>
