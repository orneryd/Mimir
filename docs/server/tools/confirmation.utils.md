[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / tools/confirmation.utils

# tools/confirmation.utils

## Functions

### generateConfirmationToken()

> **generateConfirmationToken**(`action`, `params`): `string`

Defined in: src/tools/confirmation.utils.ts:37

Generate a secure confirmation token for a destructive action

#### Parameters

##### action

`string`

Action identifier (e.g., 'memory_clear', 'delete_node')

##### params

`any`

Parameters of the action (for verification)

#### Returns

`string`

Confirmation ID that can be used to confirm the action

***

### validateConfirmationToken()

> **validateConfirmationToken**(`confirmationId`, `action`, `params`): `boolean`

Defined in: src/tools/confirmation.utils.ts:63

Validate a confirmation token

#### Parameters

##### confirmationId

`string`

Token to validate

##### action

`string`

Expected action identifier

##### params

`any`

Expected parameters (for verification)

#### Returns

`boolean`

true if token is valid, false otherwise

***

### consumeConfirmationToken()

> **consumeConfirmationToken**(`confirmationId`): `void`

Defined in: src/tools/confirmation.utils.ts:98

Consume a confirmation token (one-time use)

#### Parameters

##### confirmationId

`string`

Token to consume

#### Returns

`void`

***

### getConfirmationStats()

> **getConfirmationStats**(): `object`

Defined in: src/tools/confirmation.utils.ts:117

Get stats about pending confirmations (for monitoring)

#### Returns

`object`

##### pending

> **pending**: `number`

##### oldestAge

> **oldestAge**: `number` \| `null`
