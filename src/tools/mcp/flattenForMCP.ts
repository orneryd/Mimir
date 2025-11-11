export function isPrimitive(v: any): boolean {
  return v === null || v === undefined || ['string', 'number', 'boolean'].includes(typeof v);
}

/**
 * Check if a value is safely serializable to JSON without circular references
 */
function isSerializable(v: any): boolean {
  try {
    JSON.stringify(v);
    return true;
  } catch {
    return false;
  }
}

function _flatten(obj: Record<string, any>, parent = '', depth = 0): Record<string, any> {
  const out: Record<string, any> = {};
  
  // Safety: prevent infinite recursion (max depth 10)
  if (depth > 10) {
    console.warn(`⚠️  flattenForMCP: max depth (10) reached at key '${parent}', serializing to JSON`);
    return parent ? { [`${parent}_raw_json`]: JSON.stringify(obj) } : { raw_json: JSON.stringify(obj) };
  }
  
  for (const [k, v] of Object.entries(obj)) {
    const key = parent ? `${parent}_${k}` : k;
    
    // Handle undefined explicitly (skip it)
    if (v === undefined) {
      continue;
    }
    
    // Handle primitives (null, string, number, boolean)
    if (isPrimitive(v)) {
      out[key] = v;
    }
    // Handle arrays
    else if (Array.isArray(v)) {
      // Empty array - preserve as-is
      if (v.length === 0) {
        out[key] = [];
      }
      // Array of primitives - preserve as-is
      else if (v.every(isPrimitive)) {
        out[key] = v;
      }
      // Array of objects/mixed - serialize to JSON
      else {
        out[`${key}_raw_json`] = JSON.stringify(v);
      }
    }
    // Handle Date objects
    else if (v instanceof Date) {
      out[key] = v.toISOString();
    }
    // Handle RegExp
    else if (v instanceof RegExp) {
      out[key] = v.toString();
    }
    // Handle Map
    else if (v instanceof Map) {
      out[`${key}_raw_json`] = JSON.stringify(Array.from(v.entries()));
    }
    // Handle Set
    else if (v instanceof Set) {
      out[key] = Array.from(v);
    }
    // Handle plain objects
    else if (typeof v === 'object' && v !== null && v.constructor === Object) {
      // Check for circular references before recursing
      if (!isSerializable(v)) {
        console.warn(`⚠️  flattenForMCP: object at key '${key}' contains circular references, using string representation`);
        out[key] = String(v);
      } else {
        // Recurse into nested object
        const nested = _flatten(v as Record<string, any>, key, depth + 1);
        Object.assign(out, nested);
      }
    }
    // Handle functions (skip with warning)
    else if (typeof v === 'function') {
      console.warn(`⚠️  flattenForMCP: skipping function at key '${key}'`);
      continue;
    }
    // Handle symbols (skip with warning)
    else if (typeof v === 'symbol') {
      console.warn(`⚠️  flattenForMCP: skipping symbol at key '${key}'`);
      continue;
    }
    // Handle other object types (class instances, etc.) - serialize to JSON
    else if (typeof v === 'object' && v !== null) {
      // Check for circular references before attempting JSON.stringify
      if (isSerializable(v)) {
        out[`${key}_raw_json`] = JSON.stringify(v);
      } else {
        console.warn(`⚠️  flattenForMCP: object at key '${key}' contains circular references or is not serializable, using string representation`);
        out[key] = String(v);
      }
    }
    // Handle BigInt (not JSON-serializable by default)
    else if (typeof v === 'bigint') {
      out[key] = v.toString();
    }
    // Fallback: convert to string
    else {
      out[key] = String(v);
    }
  }
  return out;
}

/**
 * Flatten an arbitrary payload into a property map safe for MCP writes.
 * - Primitive values are preserved.
 * - Arrays of primitives are preserved.
 * - Nested objects are flattened into underscore-separated keys (a_b_c).
 * - Arrays containing objects are serialized under key_raw_json.
 */
export function flattenForMCP(payload: Record<string, any>): Record<string, any> {
  if (!payload || typeof payload !== 'object') return {};
  return _flatten(payload, '');
}

// minimal CLI for manual testing (node --loader ts-node/esm build not included here)
// export default flattenForMCP;
