# Task Output: worker-3

```typescript
import { describe, it, expect } from 'vitest';

describe('formatDate', () => {
  it('should return the date in short format for valid input', () => {
    const date = new Date('2023-10-01');
    const result = formatDate(date, 'short');
    expect(result).toBe(date.toLocaleDateString());
  });

  it('should return the date in long format for valid input', () => {
    const date = new Date('2023-10-01');
    const result = formatDate(date, 'long');
    expect(result).toBe(
      date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    );
  });

  it('should throw an error for an invalid date', () => {
    const invalidDate = new Date('invalid-date');
    expect(() => formatDate(invalidDate, 'short')).toThrow('Invalid date');
  });

  it('should throw an error if the input is not a Date object', () => {
    expect(() => formatDate('2023-10-01' as any, 'short')).toThrow(
      'Invalid date'
    );
  });
});
```