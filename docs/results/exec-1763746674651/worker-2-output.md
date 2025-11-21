# Task Output: worker-2

```typescript
describe('validateEmail', () => {
  it('should return true for a valid email address', () => {
    expect(validateEmail('test@example.com')).toBe(true);
  });

  it('should return false for an email without "@" symbol', () => {
    expect(validateEmail('testexample.com')).toBe(false);
  });

  it('should return false for an email without domain', () => {
    expect(validateEmail('test@')).toBe(false);
  });

  it('should return false for an empty string', () => {
    expect(validateEmail('')).toBe(false);
  });

  it('should return false for a null value', () => {
    expect(validateEmail(null as unknown as string)).toBe(false);
  });

  it('should return false for an email with spaces', () => {
    expect(validateEmail('test @example.com')).toBe(false);
  });
});
```