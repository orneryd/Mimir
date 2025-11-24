[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / middleware/api-key-auth

# middleware/api-key-auth

## Functions

### apiKeyAuth()

> **apiKeyAuth**(`req`, `res`, `next`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/middleware/api-key-auth.ts:77

Express middleware for stateless JWT and OAuth token authentication

Validates authentication tokens from multiple sources with automatic fallback:
1. **Authorization: Bearer** header (OAuth 2.0 RFC 6750 compliant)
2. **X-API-Key** header (common alternative)
3. **HTTP-only cookie** (for browser UI)
4. **Query parameters** (for SSE/EventSource which can't send headers)

**Token Validation Strategy**:
- First attempts JWT validation (Mimir-issued tokens)
- Falls back to OAuth provider validation if JWT fails
- Stateless: No database lookups required

**Security Features**:
- Token format validation (prevents SSRF/injection)
- Userinfo URL validation (prevents SSRF attacks)
- Configurable timeout for OAuth validation
- Multiple token sources for flexibility

#### Parameters

##### req

`Request`

Express request object

##### res

`Response`

Express response object

##### next

`NextFunction`

Express next function

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

#### Examples

```ts
// Basic usage - protect all routes
import { apiKeyAuth } from './middleware/api-key-auth.js';

app.use(apiKeyAuth);
app.use('/api', apiRouter);
```

```ts
// Protect specific routes
router.get('/api/nodes',
  apiKeyAuth,
  async (req, res) => {
    // req.user is populated with { id, email, roles }
    console.log('Authenticated user:', req.user.email);
    res.json({ nodes: [] });
  }
);
```

```ts
// Client usage - Authorization header
fetch('/api/nodes', {
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIs...'
  }
});
```

```ts
// Client usage - X-API-Key header
fetch('/api/nodes', {
  headers: {
    'X-API-Key': 'eyJhbGciOiJIUzI1NiIs...'
  }
});
```

```ts
// SSE/EventSource usage - query parameter
const eventSource = new EventSource(
  '/api/stream?access_token=eyJhbGciOiJIUzI1NiIs...'
);
```
