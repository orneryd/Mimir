[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / orchestrator/safe-tools

# orchestrator/safe-tools

## Classes

### SafeToolWrapper

Defined in: src/orchestrator/safe-tools.ts:12

#### Constructors

##### Constructor

> **new SafeToolWrapper**(`isolation`): [`SafeToolWrapper`](#safetoolwrapper)

Defined in: src/orchestrator/safe-tools.ts:15

###### Parameters

###### isolation

[`FileIsolationManager`](file-isolation.md#fileisolationmanager)

###### Returns

[`SafeToolWrapper`](#safetoolwrapper)

#### Methods

##### createSafeReadFileTool()

> **createSafeReadFileTool**(): `DynamicStructuredTool`

Defined in: src/orchestrator/safe-tools.ts:22

Create a safe read_file tool

###### Returns

`DynamicStructuredTool`

##### createSafeWriteFileTool()

> **createSafeWriteFileTool**(): `DynamicStructuredTool`

Defined in: src/orchestrator/safe-tools.ts:44

Create a safe write_file tool

###### Returns

`DynamicStructuredTool`

##### createSafeDeleteFileTool()

> **createSafeDeleteFileTool**(): `DynamicStructuredTool`

Defined in: src/orchestrator/safe-tools.ts:67

Create a safe delete_file tool

###### Returns

`DynamicStructuredTool`

##### getSafeFileTools()

> **getSafeFileTools**(): `object`

Defined in: src/orchestrator/safe-tools.ts:89

Get all safe tools as a bundle

###### Returns

`object`

###### readFileSafe

> **readFileSafe**: `DynamicStructuredTool`\<`ToolInputSchemaBase`, `any`, `any`, `any`\>

###### writeFileSafe

> **writeFileSafe**: `DynamicStructuredTool`\<`ToolInputSchemaBase`, `any`, `any`, `any`\>

###### deleteFileSafe

> **deleteFileSafe**: `DynamicStructuredTool`\<`ToolInputSchemaBase`, `any`, `any`, `any`\>

## Functions

### createSafeTools()

> **createSafeTools**(`isolation`): `object`

Defined in: src/orchestrator/safe-tools.ts:101

Create wrapped tools with isolation

#### Parameters

##### isolation

[`FileIsolationManager`](file-isolation.md#fileisolationmanager)

#### Returns

`object`

##### readFileSafe

> **readFileSafe**: `DynamicStructuredTool`\<`ToolInputSchemaBase`, `any`, `any`, `any`\>

##### writeFileSafe

> **writeFileSafe**: `DynamicStructuredTool`\<`ToolInputSchemaBase`, `any`, `any`, `any`\>

##### deleteFileSafe

> **deleteFileSafe**: `DynamicStructuredTool`\<`ToolInputSchemaBase`, `any`, `any`, `any`\>
