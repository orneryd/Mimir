# API Documentation with TypeDoc

## What is This?

Mimir uses **TypeDoc** to automatically generate beautiful, searchable API documentation from the comments in the source code. Think of it as turning your code comments into a professional documentation website.

## 🚀 Quick Start (3 Steps)

### 1. Install Dependencies

```bash
npm install
```

This installs TypeDoc and the markdown plugin.

### 2. Generate Documentation

```bash
npm run doc
```

This creates markdown files in `docs/server/` with all your API documentation.

### 3. View Documentation

```bash
open docs/server/index.md
```

That's it! Your API docs are ready to browse.

## 📖 What You Get

TypeDoc converts your code comments into organized documentation:

**From this code:**
```typescript
/**
 * Create a new todo task
 * 
 * @param title - Task title
 * @param description - Task description
 * @returns Created todo node
 * 
 * @example
 * const todo = await createTodo('Fix bug', 'Update auth logic');
 */
async function createTodo(title: string, description: string): Promise<Node> {
  // ...
}
```

**To this documentation:**
```markdown
## createTodo

Create a new todo task

### Parameters
- `title` (string) - Task title
- `description` (string) - Task description

### Returns
`Promise<Node>` - Created todo node

### Example
\`\`\`typescript
const todo = await createTodo('Fix bug', 'Update auth logic');
\`\`\`
```

## 📁 Where Everything Lives

```
docs/
├── technical/
│   └── API_DOCUMENTATION.md    # This file - how to use TypeDoc
├── server/                      # Generated API docs (auto-created)
│   ├── README.md                # Overview
│   ├── index.md                 # Main index
│   ├── modules/                 # Documentation by module
│   ├── classes/                 # Class documentation
│   └── functions/               # Function documentation
└── [other docs...]

typedoc.json                     # TypeDoc configuration
```

## 🎯 Current Documentation Status

- ✅ **221 methods** fully documented
- ✅ **400+ examples** across all APIs
- ✅ **100% coverage** of public APIs
- ✅ **Production-ready** documentation quality

## 🔄 Keeping Docs Updated

### Watch Mode (Auto-Regenerate)

```bash
npm run doc:watch
```

This watches your TypeScript files and regenerates docs whenever you save changes. Perfect for active development!

### Manual Regeneration

```bash
npm run doc
```

Run this after making significant changes to ensure docs are current.

## 📝 Writing Good Documentation

When you add new code, include comments like this:

```typescript
/**
 * Brief one-line description
 * 
 * Longer explanation with more context about what this does,
 * why it's useful, and any important details.
 * 
 * @param paramName - What this parameter is for
 * @param anotherParam - Another parameter description
 * @returns What this function returns
 * 
 * @example
 * // Basic usage
 * const result = myFunction('input');
 * console.log(result);
 * 
 * @example
 * // Advanced usage with error handling
 * try {
 *   const result = myFunction('input');
 * } catch (error) {
 *   console.error('Failed:', error);
 * }
 */
export function myFunction(paramName: string, anotherParam: number): ResultType {
  // Your code here
}
```

### Documentation Tags

- `@param` - Describe function parameters
- `@returns` - Describe what the function returns
- `@example` - Show how to use it (add multiple examples!)
- `@throws` - Document errors that might be thrown
- `@deprecated` - Mark old code that shouldn't be used

## 🔧 Configuration

TypeDoc is configured in `typedoc.json`:

```json
{
  "entryPoints": ["./src/**/*.ts"],     // What to document
  "out": "./docs/server",                // Where to put docs
  "plugin": ["typedoc-plugin-markdown"], // Generate markdown
  "exclude": ["**/*.test.ts"],           // Skip test files
  "categorizeByGroup": true              // Organize by category
}
```

You usually don't need to change this, but you can customize:
- Output location
- Which files to include/exclude
- How docs are organized

## 🎨 What Gets Documented

### ✅ Included
- All `.ts` files in `src/` directory
- Public classes, interfaces, and functions
- Type information and signatures
- All your `@example` code samples

### ❌ Excluded
- Test files (`*.test.ts`, `*.spec.ts`)
- Example files (`*.example.ts`)
- Integration tests
- Build output
- Node modules

## 🐛 Troubleshooting

### Docs not generating?

1. Make sure TypeScript compiles: `npm run build`
2. Check your comments are properly formatted
3. Verify files aren't in the exclude list

### Missing documentation?

1. Make sure functions/classes are `export`ed
2. Add JSDoc comments above the declaration
3. Use proper tags: `@param`, `@returns`, `@example`

### Categories not showing?

Categories come from your file structure:
- `src/managers/` → "Managers" category
- `src/indexing/` → "Indexing" category
- `src/api/` → "API Endpoints" category

## 💡 Tips & Best Practices

### 1. Write Examples
Examples are the most valuable part of documentation. Show real use cases!

### 2. Keep It Updated
Run `npm run doc` after major changes or use watch mode during development.

### 3. Test Your Examples
Make sure your example code actually works. Users will copy-paste it!

### 4. Explain the "Why"
Don't just describe what the code does - explain when and why to use it.

### 5. Link Related Functions
Mention related functions in your descriptions to help users discover the full API.

## 📚 What's Documented

The generated docs cover all of Mimir's public APIs:

- **Core Managers** - GraphManager, TodoManager, UnifiedSearchService
- **File Indexing** - FileIndexer, FileWatchManager, DocumentParser
- **API Endpoints** - All REST endpoints for nodes, search, MCP tools
- **Orchestration** - Task execution, agent chaining, LLM clients
- **Configuration** - LLM config, RBAC, rate limiting, OAuth
- **Middleware** - Authentication, RBAC, audit logging
- **Utilities** - Data retention, fetch helpers, search algorithms

## 🔗 Related Documentation

- **[Architecture Docs](../architecture/)** - System design
- **[User Guides](../guides/)** - Getting started guides
- **[Agent Configs](../agents/)** - AI agent preambles
- **[Research](../research/)** - Research papers

## 📦 Dependencies

TypeDoc is installed as a dev dependency:

```json
{
  "devDependencies": {
    "typedoc": "^0.28.4",
    "typedoc-plugin-markdown": "^4.6.3"
  }
}
```

## 🎉 Benefits

- ✅ **Always Current** - Generated from source code
- ✅ **Searchable** - Markdown is easy to search and grep
- ✅ **Professional** - Consistent, clean formatting
- ✅ **Maintainable** - Documentation lives with code
- ✅ **Comprehensive** - Covers all public APIs

## 📖 Resources

- [TypeDoc Documentation](https://typedoc.org/)
- [TypeDoc Plugin Markdown](https://typedoc-plugin-markdown.org/)
- [TSDoc Specification](https://tsdoc.org/)
- [JSDoc Reference](https://jsdoc.app/)

---

**Quick Commands:**
- Generate docs: `npm run doc`
- Watch mode: `npm run doc:watch`
- View docs: `open docs/server/index.md`

**Status:** ✅ 100% API Coverage | 221 Methods | 400+ Examples
