[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / orchestrator/tools

# orchestrator/tools

## Variables

### runCommandTool

> `const` **runCommandTool**: `DynamicStructuredTool`\<`ZodObject`\<\{ `command`: `ZodString`; `is_background`: `ZodDefault`\<`ZodBoolean`\>; \}, `$strip`\>, \{ `command`: `string`; `is_background`: `boolean`; \}, \{ `command`: `string`; `is_background?`: `boolean`; \}, `string`\>

Defined in: src/orchestrator/tools.ts:15

Tool: Execute shell command

***

### readFileTool

> `const` **readFileTool**: `DynamicStructuredTool`\<`ZodObject`\<\{ `target_file`: `ZodString`; `offset`: `ZodOptional`\<`ZodNumber`\>; `limit`: `ZodOptional`\<`ZodNumber`\>; \}, `$strip`\>, \{ `target_file`: `string`; `offset?`: `number`; `limit?`: `number`; \}, \{ `target_file`: `string`; `offset?`: `number`; `limit?`: `number`; \}, `string`\>

Defined in: src/orchestrator/tools.ts:50

Tool: Read file contents

***

### writeFileTool

> `const` **writeFileTool**: `DynamicStructuredTool`\<`ZodObject`\<\{ `file_path`: `ZodString`; `contents`: `ZodString`; \}, `$strip`\>, \{ `file_path`: `string`; `contents`: `string`; \}, \{ `file_path`: `string`; `contents`: `string`; \}, `string`\>

Defined in: src/orchestrator/tools.ts:86

Tool: Write/create file

***

### searchReplaceTool

> `const` **searchReplaceTool**: `DynamicStructuredTool`\<`ZodObject`\<\{ `file_path`: `ZodString`; `old_string`: `ZodString`; `new_string`: `ZodString`; `replace_all`: `ZodDefault`\<`ZodBoolean`\>; \}, `$strip`\>, \{ `file_path`: `string`; `old_string`: `string`; `new_string`: `string`; `replace_all`: `boolean`; \}, \{ `file_path`: `string`; `old_string`: `string`; `new_string`: `string`; `replace_all?`: `boolean`; \}, `string`\>

Defined in: src/orchestrator/tools.ts:110

Tool: Search/replace in file

***

### listDirTool

> `const` **listDirTool**: `DynamicStructuredTool`\<`ZodObject`\<\{ `target_directory`: `ZodString`; `ignore_globs`: `ZodOptional`\<`ZodArray`\<`ZodString`\>\>; \}, `$strip`\>, \{ `target_directory`: `string`; `ignore_globs?`: `string`[]; \}, \{ `target_directory`: `string`; `ignore_globs?`: `string`[]; \}, `string`\>

Defined in: src/orchestrator/tools.ts:145

Tool: List directory

***

### grepTool

> `const` **grepTool**: `DynamicStructuredTool`\<`ZodObject`\<\{ `pattern`: `ZodString`; `path`: `ZodOptional`\<`ZodString`\>; `type`: `ZodOptional`\<`ZodString`\>; `output_mode`: `ZodDefault`\<`ZodEnum`\<\{ `content`: `"content"`; `count`: `"count"`; `files_with_matches`: `"files_with_matches"`; \}\>\>; `case_insensitive`: `ZodDefault`\<`ZodBoolean`\>; \}, `$strip`\>, \{ `pattern`: `string`; `path?`: `string`; `type?`: `string`; `output_mode`: `"content"` \| `"count"` \| `"files_with_matches"`; `case_insensitive`: `boolean`; \}, \{ `pattern`: `string`; `path?`: `string`; `type?`: `string`; `output_mode?`: `"content"` \| `"count"` \| `"files_with_matches"`; `case_insensitive?`: `boolean`; \}, `string`\>

Defined in: src/orchestrator/tools.ts:181

Tool: Grep/search files

***

### deleteFileTool

> `const` **deleteFileTool**: `DynamicStructuredTool`\<`ZodObject`\<\{ `target_file`: `ZodString`; \}, `$strip`\>, \{ `target_file`: `string`; \}, \{ `target_file`: `string`; \}, `string`\>

Defined in: src/orchestrator/tools.ts:219

Tool: Delete file

***

### webSearchTool

> `const` **webSearchTool**: `DynamicStructuredTool`\<`ZodObject`\<\{ `search_term`: `ZodString`; \}, `$strip`\>, \{ `search_term`: `string`; \}, \{ `search_term`: `string`; \}, `string`\>

Defined in: src/orchestrator/tools.ts:238

Tool: Web fetch

***

### fileSystemTools

> `const` **fileSystemTools**: (`DynamicStructuredTool`\<`ZodObject`\<\{ `command`: `ZodString`; `is_background`: `ZodDefault`\<`ZodBoolean`\>; \}, `$strip`\>, \{ `command`: `string`; `is_background`: `boolean`; \}, \{ `command`: `string`; `is_background?`: `boolean`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `target_file`: `ZodString`; `offset`: `ZodOptional`\<`ZodNumber`\>; `limit`: `ZodOptional`\<`ZodNumber`\>; \}, `$strip`\>, \{ `target_file`: `string`; `offset?`: `number`; `limit?`: `number`; \}, \{ `target_file`: `string`; `offset?`: `number`; `limit?`: `number`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `file_path`: `ZodString`; `contents`: `ZodString`; \}, `$strip`\>, \{ `file_path`: `string`; `contents`: `string`; \}, \{ `file_path`: `string`; `contents`: `string`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `file_path`: `ZodString`; `old_string`: `ZodString`; `new_string`: `ZodString`; `replace_all`: `ZodDefault`\<`ZodBoolean`\>; \}, `$strip`\>, \{ `file_path`: `string`; `old_string`: `string`; `new_string`: `string`; `replace_all`: `boolean`; \}, \{ `file_path`: `string`; `old_string`: `string`; `new_string`: `string`; `replace_all?`: `boolean`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `target_directory`: `ZodString`; `ignore_globs`: `ZodOptional`\<`ZodArray`\<`ZodString`\>\>; \}, `$strip`\>, \{ `target_directory`: `string`; `ignore_globs?`: `string`[]; \}, \{ `target_directory`: `string`; `ignore_globs?`: `string`[]; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `pattern`: `ZodString`; `path`: `ZodOptional`\<`ZodString`\>; `type`: `ZodOptional`\<`ZodString`\>; `output_mode`: `ZodDefault`\<`ZodEnum`\<\{ `content`: `"content"`; `count`: `"count"`; `files_with_matches`: `"files_with_matches"`; \}\>\>; `case_insensitive`: `ZodDefault`\<`ZodBoolean`\>; \}, `$strip`\>, \{ `pattern`: `string`; `path?`: `string`; `type?`: `string`; `output_mode`: `"content"` \| `"count"` \| `"files_with_matches"`; `case_insensitive`: `boolean`; \}, \{ `pattern`: `string`; `path?`: `string`; `type?`: `string`; `output_mode?`: `"content"` \| `"count"` \| `"files_with_matches"`; `case_insensitive?`: `boolean`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `target_file`: `ZodString`; \}, `$strip`\>, \{ `target_file`: `string`; \}, \{ `target_file`: `string`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `search_term`: `ZodString`; \}, `$strip`\>, \{ `search_term`: `string`; \}, \{ `search_term`: `string`; \}, `string`\>)[]

Defined in: src/orchestrator/tools.ts:301

Export file system tools

***

### consolidatedTools

> `const` **consolidatedTools**: (`DynamicStructuredTool`\<`ZodObject`\<\{ `operation`: `ZodEnum`\<\{ `query`: `"query"`; `add`: `"add"`; `get`: `"get"`; `update`: `"update"`; `delete`: `"delete"`; `search`: `"search"`; \}\>; `type`: `ZodOptional`\<`ZodString`\>; `id`: `ZodOptional`\<`ZodString`\>; `properties`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodAny`\>\>; `filters`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodAny`\>\>; `query`: `ZodOptional`\<`ZodString`\>; `options`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodAny`\>\>; \}, `$strip`\>, \{ `operation`: `"query"` \| `"add"` \| `"get"` \| `"update"` \| `"delete"` \| `"search"`; `type?`: `string`; `id?`: `string`; `properties?`: `Record`\<`string`, `any`\>; `filters?`: `Record`\<`string`, `any`\>; `query?`: `string`; `options?`: `Record`\<`string`, `any`\>; \}, \{ `operation`: `"query"` \| `"add"` \| `"get"` \| `"update"` \| `"delete"` \| `"search"`; `type?`: `string`; `id?`: `string`; `properties?`: `Record`\<`string`, `any`\>; `filters?`: `Record`\<`string`, `any`\>; `query?`: `string`; `options?`: `Record`\<`string`, `any`\>; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `operation`: `ZodEnum`\<\{ `add`: `"add"`; `get`: `"get"`; `delete`: `"delete"`; `neighbors`: `"neighbors"`; `subgraph`: `"subgraph"`; \}\>; `source`: `ZodOptional`\<`ZodString`\>; `target`: `ZodOptional`\<`ZodString`\>; `type`: `ZodOptional`\<`ZodString`\>; `properties`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodAny`\>\>; `edge_id`: `ZodOptional`\<`ZodString`\>; `node_id`: `ZodOptional`\<`ZodString`\>; `direction`: `ZodOptional`\<`ZodEnum`\<\{ `in`: `"in"`; `out`: `"out"`; `both`: `"both"`; \}\>\>; `depth`: `ZodOptional`\<`ZodNumber`\>; `edge_type`: `ZodOptional`\<`ZodString`\>; \}, `$strip`\>, \{ `operation`: `"add"` \| `"get"` \| `"delete"` \| `"neighbors"` \| `"subgraph"`; `source?`: `string`; `target?`: `string`; `type?`: `string`; `properties?`: `Record`\<`string`, `any`\>; `edge_id?`: `string`; `node_id?`: `string`; `direction?`: `"in"` \| `"out"` \| `"both"`; `depth?`: `number`; `edge_type?`: `string`; \}, \{ `operation`: `"add"` \| `"get"` \| `"delete"` \| `"neighbors"` \| `"subgraph"`; `source?`: `string`; `target?`: `string`; `type?`: `string`; `properties?`: `Record`\<`string`, `any`\>; `edge_id?`: `string`; `node_id?`: `string`; `direction?`: `"in"` \| `"out"` \| `"both"`; `depth?`: `number`; `edge_type?`: `string`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `operation`: `ZodEnum`\<\{ `add_nodes`: `"add_nodes"`; `update_nodes`: `"update_nodes"`; `delete_nodes`: `"delete_nodes"`; `add_edges`: `"add_edges"`; `delete_edges`: `"delete_edges"`; \}\>; `nodes`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `type`: `ZodString`; `properties`: `ZodRecord`\<`ZodString`, `ZodAny`\>; \}, `$strip`\>\>\>; `updates`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `id`: `ZodString`; `properties`: `ZodRecord`\<`ZodString`, `ZodAny`\>; \}, `$strip`\>\>\>; `ids`: `ZodOptional`\<`ZodArray`\<`ZodString`\>\>; `edges`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `source`: `ZodString`; `target`: `ZodString`; `type`: `ZodString`; `properties`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; \}, `$strip`\>\>\>; \}, `$strip`\>, \{ `operation`: `"add_nodes"` \| `"update_nodes"` \| `"delete_nodes"` \| `"add_edges"` \| `"delete_edges"`; `nodes?`: `object`[]; `updates?`: `object`[]; `ids?`: `string`[]; `edges?`: `object`[]; \}, \{ `operation`: `"add_nodes"` \| `"update_nodes"` \| `"delete_nodes"` \| `"add_edges"` \| `"delete_edges"`; `nodes?`: `object`[]; `updates?`: `object`[]; `ids?`: `string`[]; `edges?`: `object`[]; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `operation`: `ZodEnum`\<\{ `acquire`: `"acquire"`; `release`: `"release"`; `query_available`: `"query_available"`; `cleanup`: `"cleanup"`; \}\>; `node_id`: `ZodOptional`\<`ZodString`\>; `agent_id`: `ZodOptional`\<`ZodString`\>; `timeout_ms`: `ZodOptional`\<`ZodNumber`\>; `type`: `ZodOptional`\<`ZodString`\>; `filters`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodAny`\>\>; \}, `$strip`\>, \{ `operation`: `"acquire"` \| `"release"` \| `"query_available"` \| `"cleanup"`; `node_id?`: `string`; `agent_id?`: `string`; `timeout_ms?`: `number`; `type?`: `string`; `filters?`: `Record`\<`string`, `any`\>; \}, \{ `operation`: `"acquire"` \| `"release"` \| `"query_available"` \| `"cleanup"`; `node_id?`: `string`; `agent_id?`: `string`; `timeout_ms?`: `number`; `type?`: `string`; `filters?`: `Record`\<`string`, `any`\>; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `operation`: `ZodEnum`\<\{ `get`: `"get"`; `update`: `"update"`; `delete`: `"delete"`; `create`: `"create"`; `complete`: `"complete"`; `list`: `"list"`; \}\>; `todo_id`: `ZodOptional`\<`ZodString`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `priority`: `ZodOptional`\<`ZodEnum`\<\{ `medium`: `"medium"`; `high`: `"high"`; `low`: `"low"`; \}\>\>; `status`: `ZodOptional`\<`ZodEnum`\<\{ `pending`: `"pending"`; `completed`: `"completed"`; `in_progress`: `"in_progress"`; \}\>\>; `properties`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodAny`\>\>; `list_id`: `ZodOptional`\<`ZodString`\>; `filters`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodAny`\>\>; \}, `$strip`\>, \{ `operation`: `"get"` \| `"update"` \| `"delete"` \| `"create"` \| `"complete"` \| `"list"`; `todo_id?`: `string`; `title?`: `string`; `description?`: `string`; `priority?`: `"medium"` \| `"high"` \| `"low"`; `status?`: `"pending"` \| `"completed"` \| `"in_progress"`; `properties?`: `Record`\<`string`, `any`\>; `list_id?`: `string`; `filters?`: `Record`\<`string`, `any`\>; \}, \{ `operation`: `"get"` \| `"update"` \| `"delete"` \| `"create"` \| `"complete"` \| `"list"`; `todo_id?`: `string`; `title?`: `string`; `description?`: `string`; `priority?`: `"medium"` \| `"high"` \| `"low"`; `status?`: `"pending"` \| `"completed"` \| `"in_progress"`; `properties?`: `Record`\<`string`, `any`\>; `list_id?`: `string`; `filters?`: `Record`\<`string`, `any`\>; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `operation`: `ZodEnum`\<\{ `get`: `"get"`; `update`: `"update"`; `delete`: `"delete"`; `create`: `"create"`; `list`: `"list"`; `archive`: `"archive"`; `add_todo`: `"add_todo"`; `remove_todo`: `"remove_todo"`; `get_stats`: `"get_stats"`; \}\>; `list_id`: `ZodOptional`\<`ZodString`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `priority`: `ZodOptional`\<`ZodEnum`\<\{ `medium`: `"medium"`; `high`: `"high"`; `low`: `"low"`; \}\>\>; `properties`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodAny`\>\>; `remove_completed`: `ZodOptional`\<`ZodBoolean`\>; `todo_id`: `ZodOptional`\<`ZodString`\>; `filters`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodAny`\>\>; \}, `$strip`\>, \{ `operation`: `"get"` \| `"update"` \| `"delete"` \| `"create"` \| `"list"` \| `"archive"` \| `"add_todo"` \| `"remove_todo"` \| `"get_stats"`; `list_id?`: `string`; `title?`: `string`; `description?`: `string`; `priority?`: `"medium"` \| `"high"` \| `"low"`; `properties?`: `Record`\<`string`, `any`\>; `remove_completed?`: `boolean`; `todo_id?`: `string`; `filters?`: `Record`\<`string`, `any`\>; \}, \{ `operation`: `"get"` \| `"update"` \| `"delete"` \| `"create"` \| `"list"` \| `"archive"` \| `"add_todo"` \| `"remove_todo"` \| `"get_stats"`; `list_id?`: `string`; `title?`: `string`; `description?`: `string`; `priority?`: `"medium"` \| `"high"` \| `"low"`; `properties?`: `Record`\<`string`, `any`\>; `remove_completed?`: `boolean`; `todo_id?`: `string`; `filters?`: `Record`\<`string`, `any`\>; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `command`: `ZodString`; `is_background`: `ZodDefault`\<`ZodBoolean`\>; \}, `$strip`\>, \{ `command`: `string`; `is_background`: `boolean`; \}, \{ `command`: `string`; `is_background?`: `boolean`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `target_file`: `ZodString`; `offset`: `ZodOptional`\<`ZodNumber`\>; `limit`: `ZodOptional`\<`ZodNumber`\>; \}, `$strip`\>, \{ `target_file`: `string`; `offset?`: `number`; `limit?`: `number`; \}, \{ `target_file`: `string`; `offset?`: `number`; `limit?`: `number`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `file_path`: `ZodString`; `contents`: `ZodString`; \}, `$strip`\>, \{ `file_path`: `string`; `contents`: `string`; \}, \{ `file_path`: `string`; `contents`: `string`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `file_path`: `ZodString`; `old_string`: `ZodString`; `new_string`: `ZodString`; `replace_all`: `ZodDefault`\<`ZodBoolean`\>; \}, `$strip`\>, \{ `file_path`: `string`; `old_string`: `string`; `new_string`: `string`; `replace_all`: `boolean`; \}, \{ `file_path`: `string`; `old_string`: `string`; `new_string`: `string`; `replace_all?`: `boolean`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `target_directory`: `ZodString`; `ignore_globs`: `ZodOptional`\<`ZodArray`\<`ZodString`\>\>; \}, `$strip`\>, \{ `target_directory`: `string`; `ignore_globs?`: `string`[]; \}, \{ `target_directory`: `string`; `ignore_globs?`: `string`[]; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `pattern`: `ZodString`; `path`: `ZodOptional`\<`ZodString`\>; `type`: `ZodOptional`\<`ZodString`\>; `output_mode`: `ZodDefault`\<`ZodEnum`\<\{ `content`: `"content"`; `count`: `"count"`; `files_with_matches`: `"files_with_matches"`; \}\>\>; `case_insensitive`: `ZodDefault`\<`ZodBoolean`\>; \}, `$strip`\>, \{ `pattern`: `string`; `path?`: `string`; `type?`: `string`; `output_mode`: `"content"` \| `"count"` \| `"files_with_matches"`; `case_insensitive`: `boolean`; \}, \{ `pattern`: `string`; `path?`: `string`; `type?`: `string`; `output_mode?`: `"content"` \| `"count"` \| `"files_with_matches"`; `case_insensitive?`: `boolean`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `target_file`: `ZodString`; \}, `$strip`\>, \{ `target_file`: `string`; \}, \{ `target_file`: `string`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `search_term`: `ZodString`; \}, `$strip`\>, \{ `search_term`: `string`; \}, \{ `search_term`: `string`; \}, `string`\>)[]

Defined in: src/orchestrator/tools.ts:322

Consolidated tools (8 filesystem + 6 MCP = 14 total, +1 PCTX if configured)
RECOMMENDED for chat agents to avoid tool limit and reduce API calls

***

### planningTools

> `const` **planningTools**: (`DynamicStructuredTool`\<`ZodObject`\<\{ `operation`: `ZodEnum`\<\{ `query`: `"query"`; `add`: `"add"`; `get`: `"get"`; `update`: `"update"`; `delete`: `"delete"`; `search`: `"search"`; \}\>; `type`: `ZodOptional`\<`ZodString`\>; `id`: `ZodOptional`\<`ZodString`\>; `properties`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodAny`\>\>; `filters`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodAny`\>\>; `query`: `ZodOptional`\<`ZodString`\>; `options`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodAny`\>\>; \}, `$strip`\>, \{ `operation`: `"query"` \| `"add"` \| `"get"` \| `"update"` \| `"delete"` \| `"search"`; `type?`: `string`; `id?`: `string`; `properties?`: `Record`\<`string`, `any`\>; `filters?`: `Record`\<`string`, `any`\>; `query?`: `string`; `options?`: `Record`\<`string`, `any`\>; \}, \{ `operation`: `"query"` \| `"add"` \| `"get"` \| `"update"` \| `"delete"` \| `"search"`; `type?`: `string`; `id?`: `string`; `properties?`: `Record`\<`string`, `any`\>; `filters?`: `Record`\<`string`, `any`\>; `query?`: `string`; `options?`: `Record`\<`string`, `any`\>; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `operation`: `ZodEnum`\<\{ `add`: `"add"`; `get`: `"get"`; `delete`: `"delete"`; `neighbors`: `"neighbors"`; `subgraph`: `"subgraph"`; \}\>; `source`: `ZodOptional`\<`ZodString`\>; `target`: `ZodOptional`\<`ZodString`\>; `type`: `ZodOptional`\<`ZodString`\>; `properties`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodAny`\>\>; `edge_id`: `ZodOptional`\<`ZodString`\>; `node_id`: `ZodOptional`\<`ZodString`\>; `direction`: `ZodOptional`\<`ZodEnum`\<\{ `in`: `"in"`; `out`: `"out"`; `both`: `"both"`; \}\>\>; `depth`: `ZodOptional`\<`ZodNumber`\>; `edge_type`: `ZodOptional`\<`ZodString`\>; \}, `$strip`\>, \{ `operation`: `"add"` \| `"get"` \| `"delete"` \| `"neighbors"` \| `"subgraph"`; `source?`: `string`; `target?`: `string`; `type?`: `string`; `properties?`: `Record`\<`string`, `any`\>; `edge_id?`: `string`; `node_id?`: `string`; `direction?`: `"in"` \| `"out"` \| `"both"`; `depth?`: `number`; `edge_type?`: `string`; \}, \{ `operation`: `"add"` \| `"get"` \| `"delete"` \| `"neighbors"` \| `"subgraph"`; `source?`: `string`; `target?`: `string`; `type?`: `string`; `properties?`: `Record`\<`string`, `any`\>; `edge_id?`: `string`; `node_id?`: `string`; `direction?`: `"in"` \| `"out"` \| `"both"`; `depth?`: `number`; `edge_type?`: `string`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `command`: `ZodString`; `is_background`: `ZodDefault`\<`ZodBoolean`\>; \}, `$strip`\>, \{ `command`: `string`; `is_background`: `boolean`; \}, \{ `command`: `string`; `is_background?`: `boolean`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `target_file`: `ZodString`; `offset`: `ZodOptional`\<`ZodNumber`\>; `limit`: `ZodOptional`\<`ZodNumber`\>; \}, `$strip`\>, \{ `target_file`: `string`; `offset?`: `number`; `limit?`: `number`; \}, \{ `target_file`: `string`; `offset?`: `number`; `limit?`: `number`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `file_path`: `ZodString`; `contents`: `ZodString`; \}, `$strip`\>, \{ `file_path`: `string`; `contents`: `string`; \}, \{ `file_path`: `string`; `contents`: `string`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `file_path`: `ZodString`; `old_string`: `ZodString`; `new_string`: `ZodString`; `replace_all`: `ZodDefault`\<`ZodBoolean`\>; \}, `$strip`\>, \{ `file_path`: `string`; `old_string`: `string`; `new_string`: `string`; `replace_all`: `boolean`; \}, \{ `file_path`: `string`; `old_string`: `string`; `new_string`: `string`; `replace_all?`: `boolean`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `target_directory`: `ZodString`; `ignore_globs`: `ZodOptional`\<`ZodArray`\<`ZodString`\>\>; \}, `$strip`\>, \{ `target_directory`: `string`; `ignore_globs?`: `string`[]; \}, \{ `target_directory`: `string`; `ignore_globs?`: `string`[]; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `pattern`: `ZodString`; `path`: `ZodOptional`\<`ZodString`\>; `type`: `ZodOptional`\<`ZodString`\>; `output_mode`: `ZodDefault`\<`ZodEnum`\<\{ `content`: `"content"`; `count`: `"count"`; `files_with_matches`: `"files_with_matches"`; \}\>\>; `case_insensitive`: `ZodDefault`\<`ZodBoolean`\>; \}, `$strip`\>, \{ `pattern`: `string`; `path?`: `string`; `type?`: `string`; `output_mode`: `"content"` \| `"count"` \| `"files_with_matches"`; `case_insensitive`: `boolean`; \}, \{ `pattern`: `string`; `path?`: `string`; `type?`: `string`; `output_mode?`: `"content"` \| `"count"` \| `"files_with_matches"`; `case_insensitive?`: `boolean`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `target_file`: `ZodString`; \}, `$strip`\>, \{ `target_file`: `string`; \}, \{ `target_file`: `string`; \}, `string`\> \| `DynamicStructuredTool`\<`ZodObject`\<\{ `search_term`: `ZodString`; \}, `$strip`\>, \{ `search_term`: `string`; \}, \{ `search_term`: `string`; \}, `string`\>)[]

Defined in: src/orchestrator/tools.ts:353

Planning tools for PM/Ecko agents (8 filesystem + 2 MCP = 10 total)
Minimal toolset for planning and high-level coordination

## Functions

### getConsolidatedTools()

> **getConsolidatedTools**(`includePCTX`): `Promise`\<`StructuredToolInterface`\<`ToolInputSchemaBase`, `any`, `any`\>[]\>

Defined in: src/orchestrator/tools.ts:331

Get consolidated tools with optional PCTX support
Call this instead of using consolidatedTools directly to get PCTX integration

#### Parameters

##### includePCTX

`boolean` = `true`

#### Returns

`Promise`\<`StructuredToolInterface`\<`ToolInputSchemaBase`, `any`, `any`\>[]\>

***

### getToolNames()

> **getToolNames**(): `string`[]

Defined in: src/orchestrator/tools.ts:362

Get tool names for logging

#### Returns

`string`[]
