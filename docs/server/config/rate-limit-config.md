[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / config/rate-limit-config

# config/rate-limit-config

## Interfaces

### RateLimitSettings

Defined in: src/config/rate-limit-config.ts:8

Rate Limiter Configuration

Defines rate limits for different LLM providers.
Set requestsPerHour to -1 to bypass rate limiting entirely.

#### Properties

##### requestsPerHour

> **requestsPerHour**: `number`

Defined in: src/config/rate-limit-config.ts:9

##### enableDynamicThrottling

> **enableDynamicThrottling**: `boolean`

Defined in: src/config/rate-limit-config.ts:10

##### warningThreshold

> **warningThreshold**: `number`

Defined in: src/config/rate-limit-config.ts:11

##### logLevel

> **logLevel**: `"silent"` \| `"normal"` \| `"verbose"`

Defined in: src/config/rate-limit-config.ts:12

## Variables

### DEFAULT\_RATE\_LIMITS

> `const` **DEFAULT\_RATE\_LIMITS**: `Record`\<`string`, [`RateLimitSettings`](#ratelimitsettings)\>

Defined in: src/config/rate-limit-config.ts:15

## Functions

### loadRateLimitConfig()

> **loadRateLimitConfig**(`provider`, `overrides?`): [`RateLimitSettings`](#ratelimitsettings)

Defined in: src/config/rate-limit-config.ts:72

Load rate limit configuration for a specific provider

Retrieves the default rate limit settings for a provider and applies
any custom overrides. Falls back to copilot settings if provider is unknown.

Rate limiting helps prevent API quota exhaustion and ensures fair resource
usage across multiple agents or concurrent requests.

#### Parameters

##### provider

`string`

LLM provider name ('copilot', 'ollama', 'openai', 'anthropic')

##### overrides?

`Partial`\<[`RateLimitSettings`](#ratelimitsettings)\>

Optional partial settings to override defaults

#### Returns

[`RateLimitSettings`](#ratelimitsettings)

Complete rate limit configuration with all settings

#### Example

```ts
// Load default copilot settings
const config = loadRateLimitConfig('copilot');
console.log(config.requestsPerHour); // 2500

// Load with custom overrides
const customConfig = loadRateLimitConfig('openai', {
  requestsPerHour: 5000,
  logLevel: 'verbose'
});

// Disable rate limiting for local models
const ollamaConfig = loadRateLimitConfig('ollama');
console.log(ollamaConfig.requestsPerHour); // -1 (unlimited)
```

***

### updateRateLimit()

> **updateRateLimit**(`provider`, `newLimit`): `void`

Defined in: src/config/rate-limit-config.ts:109

Update rate limit for a provider at runtime

Dynamically adjusts the rate limit for a specific provider without
restarting the application. Useful for responding to API quota changes
or adjusting limits based on usage patterns.

Note: This modifies the global DEFAULT_RATE_LIMITS object, so changes
affect all future rate limiter instances for this provider.

#### Parameters

##### provider

`string`

LLM provider name (case-insensitive)

##### newLimit

`number`

New requests per hour limit (-1 for unlimited)

#### Returns

`void`

#### Example

```ts
// Increase OpenAI limit during off-peak hours
updateRateLimit('openai', 5000);

// Temporarily disable rate limiting for testing
updateRateLimit('copilot', -1);

// Restore default limit
updateRateLimit('copilot', 2500);
```
