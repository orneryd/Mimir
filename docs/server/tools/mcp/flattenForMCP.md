[**mimir v1.0.0**](../../README.md)

***

[mimir](../../README.md) / tools/mcp/flattenForMCP

# tools/mcp/flattenForMCP

## Functions

### isPrimitive()

> **isPrimitive**(`v`): `boolean`

Defined in: src/tools/mcp/flattenForMCP.ts:1

#### Parameters

##### v

`any`

#### Returns

`boolean`

***

### flattenForMCP()

> **flattenForMCP**(`payload`): `Record`\<`string`, `any`\>

Defined in: src/tools/mcp/flattenForMCP.ts:120

Flatten an arbitrary payload into a property map safe for MCP writes.
- Primitive values are preserved.
- Arrays of primitives are preserved.
- Nested objects are flattened into underscore-separated keys (a_b_c).
- Arrays containing objects are serialized under key_raw_json.

#### Parameters

##### payload

`Record`\<`string`, `any`\>

#### Returns

`Record`\<`string`, `any`\>
