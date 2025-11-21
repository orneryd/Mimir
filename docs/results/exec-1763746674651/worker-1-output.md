# Task Output: worker-1

```typescript
import { describe, it, expect } from 'vitest';
import { calculateTotal } from './calculateTotal';

describe('calculateTotal', () => {
  it('should return the correct total for valid inputs', () => {
    const items = [
      { price: 10, quantity: 2 },
      { price: 5, quantity: 4 },
    ];
    const result = calculateTotal(items);
    expect(result).toBe(40);
  });

  it('should return 0 for an empty array', () => {
    const items: Array<{ price: number; quantity: number }> = [];
    const result = calculateTotal(items);
    expect(result).toBe(0);
  });

  it('should return 0 if items is null or undefined', () => {
    const result1 = calculateTotal(null as any);
    const result2 = calculateTotal(undefined as any);
    expect(result1).toBe(0);
    expect(result2).toBe(0);
  });

  it('should handle items with zero price or quantity', () => {
    const items = [
      { price: 0, quantity: 5 },
      { price: 10, quantity: 0 },
      { price: 15, quantity: 2 },
    ];
    const result = calculateTotal(items);
    expect(result).toBe(30);
  });
});
```