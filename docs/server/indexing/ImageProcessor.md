[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / indexing/ImageProcessor

# indexing/ImageProcessor

## Classes

### ImageProcessor

Defined in: src/indexing/ImageProcessor.ts:30

#### Constructors

##### Constructor

> **new ImageProcessor**(`config`): [`ImageProcessor`](#imageprocessor)

Defined in: src/indexing/ImageProcessor.ts:33

###### Parameters

###### config

[`ImageProcessorConfig`](#imageprocessorconfig)

###### Returns

[`ImageProcessor`](#imageprocessor)

#### Methods

##### isImageFile()

> `static` **isImageFile**(`filePath`): `boolean`

Defined in: src/indexing/ImageProcessor.ts:53

Check if a file is a supported image format

###### Parameters

###### filePath

`string`

Path to file to check

###### Returns

`boolean`

true if file extension is a supported image format

###### Examples

```ts
if (ImageProcessor.isImageFile('/path/to/photo.jpg')) {
  console.log('Image file detected');
}
```

```ts
const files = await readdir('/images');
const images = files.filter(f => ImageProcessor.isImageFile(f));
console.log('Found', images.length, 'images');
```

##### prepareImageForVL()

> **prepareImageForVL**(`imagePath`): `Promise`\<[`ProcessedImage`](#processedimage)\>

Defined in: src/indexing/ImageProcessor.ts:87

Prepare an image for vision-language model processing

Automatically resizes large images to fit within VL model limits while
preserving aspect ratio. Converts to Base64 for API transmission.

###### Parameters

###### imagePath

`string`

Absolute path to image file

###### Returns

`Promise`\<[`ProcessedImage`](#processedimage)\>

Processed image with metadata and Base64 encoding

###### Throws

If image cannot be read or processed

###### Examples

```ts
const processor = new ImageProcessor({
  maxPixels: 3211264,
  targetSize: 1792,
  resizeQuality: 85
});

const result = await processor.prepareImageForVL('/path/to/large-image.jpg');
if (result.wasResized) {
  console.log('Resized from', result.originalSize, 'to', result.processedSize);
}
console.log('Base64 size:', result.base64.length, 'chars');
```

```ts
// Process image for VL API
const processed = await processor.prepareImageForVL(imagePath);
const dataURL = processor.createDataURL(processed.base64, processed.format);
await vlModel.describeImage(dataURL);
```

##### createDataURL()

> **createDataURL**(`base64`, `format`): `string`

Defined in: src/indexing/ImageProcessor.ts:199

Create a Data URL for image (for API transmission)

Formats Base64 image data as a data URL with proper MIME type.
Used for sending images to vision-language APIs.

###### Parameters

###### base64

`string`

Base64-encoded image data

###### format

`string`

Image format (jpeg, png, webp, etc.)

###### Returns

`string`

Data URL string ready for API transmission

###### Examples

```ts
const processed = await processor.prepareImageForVL(imagePath);
const dataURL = processor.createDataURL(processed.base64, processed.format);
console.log('Data URL:', dataURL.substring(0, 50) + '...');
// Output: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAA...
```

```ts
// Send to VL API
const dataURL = processor.createDataURL(base64, 'png');
const response = await fetch('https://api.vl-model.com/describe', {
  method: 'POST',
  body: JSON.stringify({ image: dataURL })
});
```

## Interfaces

### ProcessedImage

Defined in: src/indexing/ImageProcessor.ts:14

#### Properties

##### buffer

> **buffer**: `Buffer`

Defined in: src/indexing/ImageProcessor.ts:15

##### base64

> **base64**: `string`

Defined in: src/indexing/ImageProcessor.ts:16

##### wasResized

> **wasResized**: `boolean`

Defined in: src/indexing/ImageProcessor.ts:17

##### originalSize

> **originalSize**: `object`

Defined in: src/indexing/ImageProcessor.ts:18

###### width

> **width**: `number`

###### height

> **height**: `number`

##### processedSize

> **processedSize**: `object`

Defined in: src/indexing/ImageProcessor.ts:19

###### width

> **width**: `number`

###### height

> **height**: `number`

##### format

> **format**: `string`

Defined in: src/indexing/ImageProcessor.ts:20

##### sizeBytes

> **sizeBytes**: `number`

Defined in: src/indexing/ImageProcessor.ts:21

***

### ImageProcessorConfig

Defined in: src/indexing/ImageProcessor.ts:24

#### Properties

##### maxPixels

> **maxPixels**: `number`

Defined in: src/indexing/ImageProcessor.ts:25

##### targetSize

> **targetSize**: `number`

Defined in: src/indexing/ImageProcessor.ts:26

##### resizeQuality

> **resizeQuality**: `number`

Defined in: src/indexing/ImageProcessor.ts:27
