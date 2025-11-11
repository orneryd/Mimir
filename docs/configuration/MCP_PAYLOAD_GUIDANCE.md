## MCP payload guidance — avoid nested maps in node/edge properties

Purpose
-------
This note documents practical guidance for preparing payloads when calling MCP memory tools (for example `memory_node`, `memory_edge`, and batch tools) so the Neo4j-backed memory store doesn't reject or mis-handle nested object properties. It also suggests safe patterns and small helper functions client SDKs should provide to prevent nested-object assumptions by LLMs or user scripts.

Problem
-------
The memory graph requires node/edge property values to be primitive types (string, number, boolean) or arrays thereof. Passing nested maps/objects (e.g., {meta: {author: {name: "X"}}}) will trigger validation errors. LLMs and automation that construct payloads often assume arbitrarily nested JSON is accepted, resulting in failures or partial writes.

High-level rules
----------------
1. Property values MUST be primitives or arrays of primitives. Do not pass nested maps as property values.
2. For structured data you MUST either:
   - Flatten the structure into dot-path keys (e.g. `paper_title`, `paper_authors_0_name`) or
   - Serialize the entire structure to a single JSON string property (e.g. `raw_json`) and store a short index/preview as separate primitive properties.
3. Include explicit provenance fields (primitive) on nodes/edges such as `source_url`, `source_date`, and `citation_key` so queries and QC can use them without parsing nested objects.
4. Prefer explicit typed fields over free-form blobs for common queryable attributes (title, tags[], status, created_by).

Recommended property patterns (examples)
---------------------------------------
- Good (flattened primitives + JSON fallback):
  - `title: "Paper X"`
  - `authors: ["A B","C D"]`
  - `published_year: 2023`
  - `source_url: "https://..."`
  - `raw_json: "{...}"` (string containing full nested object when you need it)

- Bad (nested map — will fail validation):
  - `metadata: { authors: [{name: 'A B'}], affiliations: {...} }`

SDK / client-side recommendations
---------------------------------
1. Automatic flattening: the client SDK should provide a `flattenForMCP(payload)` helper that either flattens nested objects into dot-path primitives or converts deep structures into a JSON string placed under `raw_json` while extracting key indexed fields.
2. Preflight validation: before submitting to MCP, run a small schema check that ensures all top-level property values are primitives or arrays of primitives; if not, reject client-side with a clear error message and a recommended fix.
3. Helpful error messages: the MCP server/tool should return errors that include the offending key path and recommended corrective action (e.g., "property 'metadata' is a nested map — flatten or serialize to 'raw_json' and re-submit").
4. Examples in SDKs: include example wrappers for common languages (TypeScript, Python) showing how to flatten and how to add a `raw_json` fallback.

Example helper (TypeScript) — flatten + fallback
------------------------------------------------
```ts
function isPrimitive(v: any): boolean {
  return v === null || ['string','number','boolean'].includes(typeof v);
}

function flatten(obj: Record<string, any>, prefix = ''): Record<string, string | number | boolean | Array<string | number | boolean>> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}_${k}` : k;
    if (isPrimitive(v) || Array.isArray(v) && v.every(isPrimitive)) {
      out[key] = v;
    } else {
      // For non-primitive children, put a JSON fallback at top-level 'raw_json' and continue
      out['raw_json'] = JSON.stringify(obj);
      break;
    }
  }
  return out;
}

// Usage before calling memory_node(operation='add', properties=...)
const safeProps = flatten(inputPayload);
// then call MCP tool with safeProps
```

Example helper (Python) — flatten + fallback
-------------------------------------------
```py
import json
from typing import Any, Dict

def is_primitive(v: Any) -> bool:
    return v is None or isinstance(v, (str, int, float, bool))

def flatten(obj: Dict[str, Any]) -> Dict[str, Any]:
    out = {}
    for k, v in obj.items():
        if is_primitive(v) or (isinstance(v, list) and all(is_primitive(x) for x in v)):
            out[k] = v
        else:
            out['raw_json'] = json.dumps(obj)
            break
    return out

# Usage: safe_props = flatten(payload)
```

Schema/contract suggestion for MCP tools
--------------------------------------
1. `memory_node(operation='add')` accepts `properties` where values are primitives or arrays. If a `raw_json` string property is present, MCP server should store it as a string and also index any explicit primitive fields.
2. Provide an optional `validate_only=true` flag to run client-side style validation on the server and return a friendly report without persisting.
3. Expose a `schema_preview` API that returns which top-level properties are indexed/queryable for a node type so clients can prioritize storing flattened fields for those keys.

Query-time guidance
--------------------
- When querying fields that may have been serialized into `raw_json`, provide helper functions to parse `raw_json` on the application side only when necessary. Avoid returning raw_json to the LLM unless explicitly requested.

Developer docs & examples
-------------------------
Add a short checklist to developer onboarding docs (or `docs/configuration/CONFIGURATION.md`) telling contributors:
1. Never assume nested objects are allowed — always flatten or serialize.
2. Use SDK helper `flattenForMCP` before all MCP write operations.
3. If you need complex structured queries, store the queryable attributes as primitive fields in addition to a `raw_json` blob.

Follow-ups (low-effort, high-value)
----------------------------------
1. Add `flattenForMCP` utilities to official client SDKs (JS/TS/Python).  
2. Add a small unit test demonstrating the common error (nested map rejected) and the successful pattern (flatten + raw_json) so contributors see the failure mode in CI.  
3. Add a sample wrapper in `bin/` or `tools/` that runs preflight checks against a JSON file prior to mem-node writes.

Summary
-------
Enforce primitive-only properties for direct MCP writes. Provide SDK helpers to flatten or serialize nested content into a `raw_json` fallback, add preflight validation and clear error messages, and document the pattern. These steps will prevent LLMs and automation from making nested-object assumptions and reduce the number of failed writes and troubleshooting cycles.

-- End of guidance
