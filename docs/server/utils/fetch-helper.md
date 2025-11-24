[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / utils/fetch-helper

# utils/fetch-helper

## Functions

### createFetchOptions()

> **createFetchOptions**(`url`, `options`): `RequestInit`

Defined in: src/utils/fetch-helper.ts:36

Create fetch options with SSL certificate handling

Automatically configures SSL/TLS settings based on the
`NODE_TLS_REJECT_UNAUTHORIZED` environment variable.

When `NODE_TLS_REJECT_UNAUTHORIZED=0`, disables certificate validation
for HTTPS requests. Useful for development with self-signed certificates.

**Security Warning:** Never set `NODE_TLS_REJECT_UNAUTHORIZED=0` in production!

#### Parameters

##### url

`string`

The URL to fetch

##### options

`RequestInit` = `{}`

Base fetch options to extend

#### Returns

`RequestInit`

Fetch options with SSL agent configured if needed

#### Example

```ts
// Development with self-signed cert
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const options = createFetchOptions('https://localhost:8443/api');
const response = await fetch('https://localhost:8443/api', options);

// Production (validates certificates)
delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
const options = createFetchOptions('https://api.example.com');
const response = await fetch('https://api.example.com', options);
```

***

### addAuthHeader()

> **addAuthHeader**(`options`, `apiKeyEnvVar`): `RequestInit`

Defined in: src/utils/fetch-helper.ts:74

Add Authorization Bearer header to fetch options

Reads API key from environment variable and adds it as a Bearer token.
If the environment variable is not set, returns options unchanged.

#### Parameters

##### options

`RequestInit`

Fetch options to extend

##### apiKeyEnvVar

`string` = `'MIMIR_LLM_API_KEY'`

Environment variable name for API key (default: MIMIR_LLM_API_KEY)

#### Returns

`RequestInit`

Fetch options with Authorization header if API key exists

#### Example

```ts
process.env.MIMIR_LLM_API_KEY = 'sk-abc123';

let options = {};
options = addAuthHeader(options);
// options.headers['Authorization'] = 'Bearer sk-abc123'

// Custom API key variable
process.env.MY_API_KEY = 'custom-key';
options = addAuthHeader({}, 'MY_API_KEY');
// options.headers['Authorization'] = 'Bearer custom-key'
```

***

### createTimeoutSignal()

> **createTimeoutSignal**(`timeoutMs`): `AbortSignal`

Defined in: src/utils/fetch-helper.ts:111

Create an AbortSignal with timeout for fetch requests

Prevents hanging requests by automatically aborting after the specified timeout.

#### Parameters

##### timeoutMs

`number` = `10000`

Timeout in milliseconds (default: 10000ms = 10 seconds)

#### Returns

`AbortSignal`

AbortSignal that will abort after timeout

#### Example

```ts
// 10 second timeout (default)
const signal = createTimeoutSignal();
try {
  const response = await fetch('https://api.example.com', { signal });
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request timed out after 10 seconds');
  }
}

// Custom 30 second timeout
const signal = createTimeoutSignal(30000);
const response = await fetch('https://slow-api.example.com', { signal });
```

***

### validateOAuthTokenFormat()

> **validateOAuthTokenFormat**(`token`): `boolean`

Defined in: src/utils/fetch-helper.ts:153

Validate OAuth bearer token format to prevent security attacks

Performs comprehensive validation to prevent:
- **SSRF attacks**: Ensures token doesn't contain URLs or protocols
- **Injection attacks**: Blocks newlines, control characters, HTML/JS
- **DoS attacks**: Enforces maximum token length (8KB)

Valid tokens contain only base64url characters, dots, hyphens, underscores,
and URL-safe characters commonly found in JWT and OAuth tokens.

#### Parameters

##### token

`string`

The token to validate

#### Returns

`boolean`

true if token format is valid

#### Throws

Error if token format is invalid with specific reason

#### Example

```ts
// Valid JWT token
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123';
validateOAuthTokenFormat(token); // Returns true

// Invalid: contains newline (injection attempt)
try {
  validateOAuthTokenFormat('token\nmalicious-header: value');
} catch (error) {
  console.log(error.message); // 'Token contains suspicious patterns'
}

// Invalid: too long (DoS attempt)
try {
  validateOAuthTokenFormat('a'.repeat(10000));
} catch (error) {
  console.log(error.message); // 'Token exceeds maximum length'
}
```

***

### validateOAuthUserinfoUrl()

> **validateOAuthUserinfoUrl**(`url`): `boolean`

Defined in: src/utils/fetch-helper.ts:231

Validate OAuth userinfo URL to prevent SSRF (Server-Side Request Forgery) attacks

Ensures the URL is safe to fetch by blocking:
- **Private IP ranges**: 10.x.x.x, 192.168.x.x, 172.16-31.x.x
- **Localhost**: 127.0.0.1, ::1, localhost
- **Link-local addresses**: 169.254.x.x, fe80::
- **Non-HTTP(S) protocols**: file://, javascript://, data://

In production, only HTTPS is allowed (unless `MIMIR_OAUTH_ALLOW_HTTP=true`).
In development, localhost is permitted for local OAuth testing.

#### Parameters

##### url

`string`

The URL to validate

#### Returns

`boolean`

true if URL is safe to fetch

#### Throws

Error if URL is unsafe with specific reason

#### Example

```ts
// Valid production URL
validateOAuthUserinfoUrl('https://oauth.example.com/userinfo');
// Returns true

// Invalid: private IP (SSRF attempt)
try {
  validateOAuthUserinfoUrl('https://192.168.1.1/admin');
} catch (error) {
  console.log(error.message); // 'Private IP addresses are not allowed'
}

// Development: localhost allowed
process.env.NODE_ENV = 'development';
validateOAuthUserinfoUrl('http://localhost:3000/userinfo');
// Returns true

// Production: localhost blocked
process.env.NODE_ENV = 'production';
try {
  validateOAuthUserinfoUrl('http://localhost:3000/userinfo');
} catch (error) {
  console.log(error.message); // 'Localhost is not allowed in production'
}
```

***

### createSecureFetchOptions()

> **createSecureFetchOptions**(`url`, `options`, `apiKeyEnvVar?`, `timeoutMs?`): `RequestInit`

Defined in: src/utils/fetch-helper.ts:351

Create secure fetch options with SSL, authentication, and timeout

Convenience function that combines SSL handling, authentication,
and timeout configuration in one call.

**Features:**
- SSL certificate handling (respects NODE_TLS_REJECT_UNAUTHORIZED)
- Optional Bearer token authentication from environment
- Automatic request timeout (default: 10 seconds)

#### Parameters

##### url

`string`

The URL to fetch

##### options

`RequestInit` = `{}`

Base fetch options to extend

##### apiKeyEnvVar?

`string`

Optional environment variable name for API key

##### timeoutMs?

`number` = `10000`

Optional timeout in milliseconds (default: 10000ms = 10s)

#### Returns

`RequestInit`

Fetch options with SSL, auth, and timeout configured

#### Example

```ts
// Simple usage with defaults
const options = createSecureFetchOptions('https://api.example.com/data');
const response = await fetch('https://api.example.com/data', options);

// With authentication
process.env.MIMIR_LLM_API_KEY = 'sk-abc123';
const options = createSecureFetchOptions(
  'https://api.openai.com/v1/models',
  {},
  'MIMIR_LLM_API_KEY'
);
// Adds: Authorization: Bearer sk-abc123

// With custom timeout (30 seconds)
const options = createSecureFetchOptions(
  'https://slow-api.example.com',
  { method: 'POST', body: JSON.stringify(data) },
  undefined,
  30000
);

// Full example with error handling
try {
  const options = createSecureFetchOptions(
    'https://api.example.com',
    { method: 'GET' },
    'MY_API_KEY',
    5000
  );
  const response = await fetch('https://api.example.com', options);
  const data = await response.json();
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request timed out');
  }
}
```
