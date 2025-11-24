[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / indexing/DocumentParser

# indexing/DocumentParser

## Classes

### DocumentParser

Defined in: src/indexing/DocumentParser.ts:8

#### Constructors

##### Constructor

> **new DocumentParser**(): [`DocumentParser`](#documentparser)

###### Returns

[`DocumentParser`](#documentparser)

#### Methods

##### extractText()

> **extractText**(`buffer`, `extension`): `Promise`\<`string`\>

Defined in: src/indexing/DocumentParser.ts:65

Extract plain text from PDF or DOCX files for indexing

Parses binary document formats and extracts readable text content.
Used by FileIndexer to make documents searchable and embeddable.
Automatically detects format from extension and uses appropriate parser.

Supported Formats:
- **PDF**: Uses pdf-parse library for text extraction
- **DOCX**: Uses mammoth library for text extraction

###### Parameters

###### buffer

`Buffer`

File content as Buffer

###### extension

`string`

File extension (.pdf, .docx)

###### Returns

`Promise`\<`string`\>

Extracted plain text content

###### Throws

If format is unsupported or extraction fails

###### Examples

```ts
// Extract text from PDF file
const parser = new DocumentParser();
const pdfBuffer = await fs.readFile('/path/to/document.pdf');
const text = await parser.extractText(pdfBuffer, '.pdf');
console.log('Extracted', text.length, 'characters');
console.log('First 100 chars:', text.substring(0, 100));
```

```ts
// Extract text from DOCX file
const docxBuffer = await fs.readFile('/path/to/document.docx');
const text = await parser.extractText(docxBuffer, '.docx');
console.log('Document text:', text);
```

```ts
// Handle extraction errors
try {
  const buffer = await fs.readFile('/path/to/doc.pdf');
  const text = await parser.extractText(buffer, '.pdf');
  if (text.length === 0) {
    console.warn('Document is empty');
  }
} catch (error) {
  if (error.message.includes('no extractable text')) {
    console.log('PDF is image-based or encrypted');
  } else {
    console.error('Extraction failed:', error.message);
  }
}
```

```ts
// Use in file indexing pipeline
const files = await glob('docs/*.{pdf,docx}');
for (const file of files) {
  const buffer = await fs.readFile(file);
  const ext = path.extname(file);
  const text = await parser.extractText(buffer, ext);
  await indexDocument(file, text);
}
```

##### isSupportedFormat()

> **isSupportedFormat**(`extension`): `boolean`

Defined in: src/indexing/DocumentParser.ts:160

Check if a file extension is supported for document parsing

Tests whether the parser can extract text from files with the given
extension. Use this before attempting extraction to avoid errors.

###### Parameters

###### extension

`string`

File extension (e.g., '.pdf', '.docx')

###### Returns

`boolean`

true if format is supported, false otherwise

###### Examples

```ts
// Check before parsing
const parser = new DocumentParser();
const file = '/path/to/document.pdf';
const ext = path.extname(file);

if (parser.isSupportedFormat(ext)) {
  const buffer = await fs.readFile(file);
  const text = await parser.extractText(buffer, ext);
  console.log('Extracted:', text.length, 'chars');
} else {
  console.log('Unsupported format:', ext);
}
```

```ts
// Filter files by supported formats
const allFiles = await glob('documents/*.*');
const supportedFiles = allFiles.filter(file => {
  const ext = path.extname(file);
  return parser.isSupportedFormat(ext);
});
console.log('Can parse', supportedFiles.length, 'files');
```

```ts
// Build supported extensions list
const extensions = ['.pdf', '.docx', '.txt', '.md', '.doc'];
const supported = extensions.filter(ext => parser.isSupportedFormat(ext));
console.log('Supported:', supported.join(', '));
// Output: Supported: .pdf, .docx
```
