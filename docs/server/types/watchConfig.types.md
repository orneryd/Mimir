[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / types/watchConfig.types

# types/watchConfig.types

## Interfaces

### WatchConfig

Defined in: src/types/watchConfig.types.ts:5

#### Properties

##### id

> **id**: `string`

Defined in: src/types/watchConfig.types.ts:6

##### path

> **path**: `string`

Defined in: src/types/watchConfig.types.ts:7

##### host\_path?

> `optional` **host\_path**: `string`

Defined in: src/types/watchConfig.types.ts:8

##### recursive

> **recursive**: `boolean`

Defined in: src/types/watchConfig.types.ts:9

##### debounce\_ms

> **debounce\_ms**: `number`

Defined in: src/types/watchConfig.types.ts:10

##### file\_patterns

> **file\_patterns**: `string`[] \| `null`

Defined in: src/types/watchConfig.types.ts:11

##### ignore\_patterns

> **ignore\_patterns**: `string`[]

Defined in: src/types/watchConfig.types.ts:12

##### generate\_embeddings

> **generate\_embeddings**: `boolean`

Defined in: src/types/watchConfig.types.ts:13

##### status

> **status**: `"active"` \| `"inactive"`

Defined in: src/types/watchConfig.types.ts:14

##### added\_date

> **added\_date**: `string`

Defined in: src/types/watchConfig.types.ts:15

##### last\_indexed?

> `optional` **last\_indexed**: `string`

Defined in: src/types/watchConfig.types.ts:16

##### last\_updated?

> `optional` **last\_updated**: `string`

Defined in: src/types/watchConfig.types.ts:17

##### files\_indexed?

> `optional` **files\_indexed**: `number`

Defined in: src/types/watchConfig.types.ts:18

##### error?

> `optional` **error**: `string`

Defined in: src/types/watchConfig.types.ts:19

***

### WatchConfigInput

Defined in: src/types/watchConfig.types.ts:22

#### Properties

##### path

> **path**: `string`

Defined in: src/types/watchConfig.types.ts:23

##### host\_path?

> `optional` **host\_path**: `string`

Defined in: src/types/watchConfig.types.ts:24

##### recursive?

> `optional` **recursive**: `boolean`

Defined in: src/types/watchConfig.types.ts:25

##### debounce\_ms?

> `optional` **debounce\_ms**: `number`

Defined in: src/types/watchConfig.types.ts:26

##### file\_patterns?

> `optional` **file\_patterns**: `string`[] \| `null`

Defined in: src/types/watchConfig.types.ts:27

##### ignore\_patterns?

> `optional` **ignore\_patterns**: `string`[]

Defined in: src/types/watchConfig.types.ts:28

##### generate\_embeddings?

> `optional` **generate\_embeddings**: `boolean`

Defined in: src/types/watchConfig.types.ts:29

***

### WatchFolderResponse

Defined in: src/types/watchConfig.types.ts:32

#### Properties

##### watch\_id

> **watch\_id**: `string`

Defined in: src/types/watchConfig.types.ts:33

##### path

> **path**: `string`

Defined in: src/types/watchConfig.types.ts:34

##### status

> **status**: `string`

Defined in: src/types/watchConfig.types.ts:35

##### message

> **message**: `string`

Defined in: src/types/watchConfig.types.ts:36

***

### IndexFolderResponse

Defined in: src/types/watchConfig.types.ts:39

#### Properties

##### status

> **status**: `"success"` \| `"error"`

Defined in: src/types/watchConfig.types.ts:40

##### path?

> `optional` **path**: `string`

Defined in: src/types/watchConfig.types.ts:41

##### containerPath?

> `optional` **containerPath**: `string`

Defined in: src/types/watchConfig.types.ts:42

##### files\_indexed?

> `optional` **files\_indexed**: `number`

Defined in: src/types/watchConfig.types.ts:43

##### files\_removed?

> `optional` **files\_removed**: `number`

Defined in: src/types/watchConfig.types.ts:44

##### elapsed\_ms?

> `optional` **elapsed\_ms**: `number`

Defined in: src/types/watchConfig.types.ts:45

##### error?

> `optional` **error**: `string`

Defined in: src/types/watchConfig.types.ts:46

##### message?

> `optional` **message**: `string`

Defined in: src/types/watchConfig.types.ts:47

##### hint?

> `optional` **hint**: `string`

Defined in: src/types/watchConfig.types.ts:48

***

### ListWatchedFoldersResponse

Defined in: src/types/watchConfig.types.ts:51

#### Properties

##### watches

> **watches**: `object`[]

Defined in: src/types/watchConfig.types.ts:52

###### watch\_id

> **watch\_id**: `string`

###### folder

> **folder**: `string`

###### containerPath?

> `optional` **containerPath**: `string`

###### recursive

> **recursive**: `boolean`

###### files\_indexed

> **files\_indexed**: `number`

###### last\_update

> **last\_update**: `string`

###### active

> **active**: `boolean`

##### total

> **total**: `number`

Defined in: src/types/watchConfig.types.ts:61
