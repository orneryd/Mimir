[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / config/oauth-constants

# config/oauth-constants

## Variables

### DEFAULT\_OAUTH\_TIMEOUT\_MS

> `const` **DEFAULT\_OAUTH\_TIMEOUT\_MS**: `10000` = `10000`

Defined in: src/config/oauth-constants.ts:13

Default timeout for OAuth userinfo requests in milliseconds
Can be overridden via MIMIR_OAUTH_TIMEOUT_MS environment variable

## Functions

### getOAuthTimeout()

> **getOAuthTimeout**(): `number`

Defined in: src/config/oauth-constants.ts:40

Get configured OAuth timeout from environment or use default

Reads `MIMIR_OAUTH_TIMEOUT_MS` environment variable and validates it.
Falls back to default (10 seconds) if not set or invalid.

#### Returns

`number`

Timeout in milliseconds for OAuth userinfo requests

#### Example

```ts
// Use default timeout
const timeout = getOAuthTimeout();
console.log(timeout); // 10000

// Custom timeout via environment
process.env.MIMIR_OAUTH_TIMEOUT_MS = '30000';
const customTimeout = getOAuthTimeout();
console.log(customTimeout); // 30000

// Invalid value falls back to default
process.env.MIMIR_OAUTH_TIMEOUT_MS = 'invalid';
const fallbackTimeout = getOAuthTimeout();
// Logs warning, returns 10000
```
