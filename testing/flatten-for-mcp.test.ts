import { describe, it, expect } from 'vitest';
import { flattenForMCP } from '../src/tools/mcp/flattenForMCP';

describe('flattenForMCP', () => {
  it('flattens nested objects into underscore keys', () => {
    const nested = {
      title: 'Paper X',
      authors: [{ name: 'Alice' }, { name: 'Bob' }],
      meta: {
        journal: 'PLOS',
        info: { year: 2023, pages: { start: 10, end: 20 } },
      },
      tags: ['ml', 'neuro']
    };

    const flat = flattenForMCP(nested);

    expect(flat.title).toBe('Paper X');
    expect(flat.tags).toEqual(['ml', 'neuro']);
    // nested scalar
    expect(flat['meta_journal']).toBe('PLOS');
    // nested deep scalar
    expect(flat['meta_info_year']).toBe(2023);
    expect(flat['meta_info_pages_start']).toBe(10);
    // authors is an array of objects -> should produce a raw_json fallback
    expect(typeof flat['authors_raw_json']).toBe('string');
    const parsed = JSON.parse(flat['authors_raw_json']);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].name).toBe('Alice');
  });

  it('preserves already-flat payloads', () => {
    const flatInput = {
      title: 'Paper X',
      tags: ['ml'],
      meta_journal: 'PLOS'
    };
    const out = flattenForMCP(flatInput as any);
    expect(out.title).toBe('Paper X');
    expect(out.meta_journal).toBe('PLOS');
  });

  it('handles null and undefined values', () => {
    const input = {
      nullValue: null,
      undefinedValue: undefined,
      normalValue: 'test'
    };
    const flat = flattenForMCP(input);
    expect(flat.nullValue).toBeNull();
    expect(flat.undefinedValue).toBeUndefined();
    expect(flat.normalValue).toBe('test');
  });

  it('handles empty arrays', () => {
    const input = { emptyArray: [], primitiveArray: [1, 2, 3] };
    const flat = flattenForMCP(input);
    expect(flat.emptyArray).toEqual([]);
    expect(flat.primitiveArray).toEqual([1, 2, 3]);
  });

  it('handles Date objects', () => {
    const date = new Date('2025-11-10T12:00:00Z');
    const input = { createdAt: date };
    const flat = flattenForMCP(input);
    expect(flat.createdAt).toBe('2025-11-10T12:00:00.000Z');
  });

  it('handles RegExp objects', () => {
    const input = { pattern: /test/gi };
    const flat = flattenForMCP(input);
    expect(flat.pattern).toBe('/test/gi');
  });

  it('handles Map objects', () => {
    const map = new Map([['key1', 'value1'], ['key2', 'value2']]);
    const input = { myMap: map };
    const flat = flattenForMCP(input);
    expect(typeof flat.myMap_raw_json).toBe('string');
    const parsed = JSON.parse(flat.myMap_raw_json);
    expect(parsed).toEqual([['key1', 'value1'], ['key2', 'value2']]);
  });

  it('handles Set objects', () => {
    const set = new Set(['a', 'b', 'c']);
    const input = { mySet: set };
    const flat = flattenForMCP(input);
    expect(flat.mySet).toEqual(['a', 'b', 'c']);
  });

  it('skips function properties', () => {
    const input = {
      normalProp: 'test',
      funcProp: () => 'hello'
    };
    const flat = flattenForMCP(input);
    expect(flat.normalProp).toBe('test');
    expect(flat.funcProp).toBeUndefined();
  });

  it('handles deeply nested objects (max depth protection)', () => {
    // Create a deeply nested object (15 levels)
    let deep: any = { value: 'bottom' };
    for (let i = 0; i < 14; i++) {
      deep = { nested: deep };
    }
    const input = { deep };
    const flat = flattenForMCP(input);
    // Should have stopped at depth 10 and serialized the rest to JSON
    expect(Object.keys(flat).some(k => k.includes('raw_json'))).toBe(true);
  });

  it('handles mixed primitive and non-primitive arrays', () => {
    const input = {
      mixed: [1, 'string', { obj: 'value' }, null]
    };
    const flat = flattenForMCP(input);
    expect(typeof flat.mixed_raw_json).toBe('string');
    const parsed = JSON.parse(flat.mixed_raw_json);
    expect(parsed).toEqual([1, 'string', { obj: 'value' }, null]);
  });

  it('handles circular reference gracefully', () => {
    const input: any = { name: 'test' };
    input.self = input; // circular reference
    const flat = flattenForMCP(input);
    // Should handle the circular reference (either skip or serialize what it can)
    expect(flat.name).toBe('test');
  });
});
