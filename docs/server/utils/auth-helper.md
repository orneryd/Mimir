[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / utils/auth-helper

# utils/auth-helper

## Functions

### hasAuthCredentials()

> **hasAuthCredentials**(`req`): `boolean`

Defined in: src/utils/auth-helper.ts:53

Check if a request has any form of authentication credentials

Performs a comprehensive check across multiple authentication methods
to support various client types (API clients, browsers, SSE connections).

**Authentication Sources (checked in order):**
1. **Authorization: Bearer** header - OAuth 2.0 RFC 6750 standard
2. **X-API-Key** header - Common alternative for API keys
3. **mimir_oauth_token** cookie - For browser-based UI sessions
4. **access_token** query parameter - For SSE (Server-Sent Events) which can't send custom headers
5. **api_key** query parameter - Legacy support for older clients

This function only checks for *presence* of credentials, not validity.
Actual validation happens in authentication middleware.

#### Parameters

##### req

`Request`

Express request object

#### Returns

`boolean`

true if any authentication credential is present, false otherwise

#### Example

```ts
// In middleware
app.use((req, res, next) => {
  if (!hasAuthCredentials(req)) {
    return res.status(401).json({ error: 'No credentials provided' });
  }
  next();
});

// Different client types
// API client with Bearer token
fetch('/api/nodes', {
  headers: { 'Authorization': 'Bearer token123' }
}); // hasAuthCredentials() returns true

// Browser with cookie
fetch('/api/nodes', {
  credentials: 'include' // Sends mimir_oauth_token cookie
}); // hasAuthCredentials() returns true

// SSE connection (can't use custom headers)
const es = new EventSource('/api/events?access_token=token123');
// hasAuthCredentials() returns true
```
