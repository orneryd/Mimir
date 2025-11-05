# Mimir Direct Translation Validation (No Script Execution)

## OBJECTIVE

Validate all Caremark page Spanish translations from MongoDB database using direct tool calls (no script execution to avoid double-hop agent problem).

## DATABASE CONNECTION

**MongoDB URL:** `mongodb+srv://retaildb_user:4nCSRFe6fMnQkicw@dev-pl-0.m5bbz.mongodb.net/caremark-translation`

**Prisma Schema:**
```prisma
model Translation {
  id          String             @id @default(auto()) @map("_id") @db.ObjectId
  textKey     String?
  textKey128  String?
  originalText String?
  page        String?
  texts       TranslationText[]
}

model TranslationText {
  id                String      @id @default(auto()) @map("_id") @db.ObjectId
  translationId     String      @db.ObjectId
  translation       Translation @relation(fields: [translationId], references: [id])
  language          String      // "es" for Spanish
  translatedText    String
  auditedText       String?
  isReviewed        Boolean     @default(false)
  reviewResult      String?     // 'approved' | 'rejected' | null
}
```

## QC VALIDATION CRITERIA

**5 Criteria (0-100 total):**
1. **Accuracy** (0-20): Exact meaning preserved, no information loss
2. **Fluency** (0-20): Natural Spanish, proper grammar
3. **Medical Terminology** (0-20): Correct pharmaceutical/healthcare terms
4. **Professional Tone** (0-20): Formal register (use "usted" not "tú")
5. **Completeness** (0-20): All information translated

**Validation Prompt Template:**
```
You are a Spanish translation auditor for CVS Health/Caremark healthcare content.

Audit these translations using 5 criteria (Accuracy, Fluency, Medical Terminology, Professional Tone, Completeness).

For each translation, respond with JSON:
{
  "score": 0-100,
  "isValid": true/false,
  "issues": ["list of issues"],
  "auditedRecommendation": "improved translation",
  "reasoning": "brief explanation"
}
```

## WORKFLOW (4 Phases, 6 Tasks)

### Phase 1: Data Loading (2 tasks)
**Task 1.1:** Load page ownership data from CSV
**Task 1.2:** Query MongoDB for pages with Spanish translations

### Phase 2: Translation Validation (2 tasks)
**Task 2.1:** Fetch translations from MongoDB (batched, 100 per page)
**Task 2.2:** Validate translations using worker's LLM (batched, 10 at a time)

### Phase 3: Report Generation (1 task)
**Task 3.1:** Generate CSV report with validation results

### Phase 4: Summary (1 task)
**Task 4.1:** Generate executive summary by business area

## DETAILED TASK SPECIFICATIONS

---

### Task 1.1: Load Page Ownership Data

**Tool-Based Execution:**
- Use: read_file to read testing/translation-validation-tool/KEYSTONE-TEAM-OWNERSHIP.csv
- Execute: Parse CSV in-memory using Node.js (csv-parse library if available, or manual parsing)
- Store: memory_add_node with properties: { pages: [{ urlPath, businessArea, team, productOwner }], totalPages: N }
- Do NOT: Create new CSV parser files

**Data Extraction:**
- Source: testing/translation-validation-tool/KEYSTONE-TEAM-OWNERSHIP.csv
- Field: "URL Path" (string, e.g., "/pharmacy/benefits/cmk-dashboard")
- Field: "Business Area" (string, e.g., "Caremark")
- Field: "Team/Train" (string, e.g., "Team Falcon")
- Field: "Product Owner" (string)
- If missing: Skip row and log warning

**Output:** Graph node ID for downstream tasks

---

### Task 1.2: Query MongoDB for Pages with Translations

**Tool-Based Execution:**
- Use: run_terminal_cmd to execute Node.js script that queries Prisma
- Execute: One-liner Prisma query to get distinct pages
- Store: memory_add_node with properties: { pagesInDB: [urls], totalPagesInDB: N }
- Do NOT: Create new query scripts

**Configuration:**
- Location: testing/translation-validation-tool/.env
- Load: Prisma client automatically loads from .env
- Required: DATABASE_URL
- Verify: Test connection before proceeding

**Command Example:**
```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.translation.findMany({
  select: { page: true },
  distinct: ['page'],
  where: { texts: { some: { language: 'es' } } },
  take: 50
}).then(pages => console.log(JSON.stringify(pages.map(p => p.page))))
  .finally(() => prisma.\$disconnect());
"
```

**Output:** Graph node ID with pages from database

---

### Task 2.1: Fetch Translations for Each Page (Batched)

**Tool-Based Execution:**
- Use: run_terminal_cmd to execute Prisma query for each page
- Execute: Fetch 100 translations per page (paginated if needed)
- Store: memory_add_node for each page with properties: { pageUrl, translations: [...], totalCount: N }
- Do NOT: Create new fetching utilities

**Command Example:**
```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const pageUrl = '/pharmacy/benefits/cmk-dashboard';
prisma.translation.findMany({
  where: { page: { contains: pageUrl } },
  include: { texts: { where: { language: 'es' }, take: 5 } },
  take: 100
}).then(data => console.log(JSON.stringify(data)))
  .finally(() => prisma.\$disconnect());
"
```

**Output:** Graph node ID per page with translation data

---

### Task 2.2: Validate Translations Using Worker's LLM

**CRITICAL:** Worker agent has DIRECT access to LLM (Copilot API). Do NOT execute external script.

**Tool-Based Execution:**
- Use: Worker's built-in LLM access (NOT run_terminal_cmd)
- Execute: Batch validate 10 translations at a time using worker's LLM tool
- Store: memory_add_node for each batch with properties: { pageUrl, batchNum, validations: [...] }
- Do NOT: Execute validate-translations.js script (causes double-hop)

**Function Usage:**
- Worker has access to: LLM tool for chat completions
- Call: Send validation prompt to LLM with batch of 10 translations
- Returns: JSON array with { score, isValid, issues, auditedRecommendation, reasoning }
- On error: Log error, mark validation as failed, continue with next batch

**Validation Prompt (for worker to use):**
```
System: You are a Spanish translation auditor for CVS Health/Caremark healthcare content.

User: Audit these 10 translations:

**Translation 1:**
Original: "{originalText}"
Spanish: "{translatedText}"
Audited: "{auditedText or null}"

[... repeat for 10 translations ...]

**Context:**
- Page: {pageUrl}
- Business Area: {businessArea}
- Domain: Healthcare/Pharmacy

**Criteria (0-100 total):**
1. Accuracy (0-20): Exact meaning preserved
2. Fluency (0-20): Natural Spanish
3. Medical Terminology (0-20): Correct pharma terms
4. Professional Tone (0-20): Formal register (usted)
5. Completeness (0-20): All info translated

Respond with JSON array (one object per translation):
[
  {
    "translationNumber": 1,
    "score": 0-100,
    "isValid": true/false,
    "issues": ["list"],
    "auditedRecommendation": "improved translation",
    "reasoning": "brief explanation"
  },
  ...
]
```

**Time Estimate:**
- Base time: 30 min (260 pages × 10 translations avg × 10 batches)
- Network I/O multiplier: 3x (MongoDB queries)
- Rate limit multiplier: 2x (LLM API calls, 1.5s delay between batches)
- Calculated: 30 × 3 × 2 = 180 min (3 hours)
- Overhead: +30 min (context switching, error handling)
- **Total: 3.5 hours**

**Output:** Graph node IDs with validation results per batch

---

### Task 3.1: Generate CSV Report

**Tool-Based Execution:**
- Use: memory_get_node to retrieve all validation results from previous tasks
- Execute: Format data in-memory using string templates
- Store: Write CSV to reports/translation-validation-{date}.csv using write tool
- Do NOT: Create new report generator scripts

**Data Extraction:**
- Source: Graph nodes from Task 1.1, 2.1, 2.2
- Combine: Page metadata + translations + validation results
- Format: CSV with 16 columns (see below)

**CSV Columns:**
```
Business Area, Page URL, Feature Category, Product Owner, Team,
Text Key, Original Text, Spanish Translation, Existing Audited Text,
Human Review Status, Human Review Result,
AI Audit Score, AI Validation, Issues Found, AI Audited Recommendation, AI Audit Reasoning
```

**Output:** CSV file path

---

### Task 4.1: Generate Executive Summary

**Tool-Based Execution:**
- Use: memory_get_node to retrieve all validation results
- Execute: Aggregate data in-memory by business area
- Store: Write JSON to reports/translation-summary-{date}.json using write tool
- Do NOT: Create new summary generator scripts

**Summary Structure:**
```json
{
  "generatedAt": "ISO timestamp",
  "totalPages": N,
  "totalTranslations": N,
  "totalValidated": N,
  "byBusinessArea": {
    "Caremark": {
      "pages": N,
      "translations": N,
      "avgScore": N,
      "issues": N
    }
  },
  "byPage": [
    {
      "page": "url",
      "businessArea": "area",
      "avgScore": N,
      "issueCount": N
    }
  ]
}
```

**Output:** JSON file path

---

## DEPENDENCIES

```
task-1.1 (Load CSV) → task-2.1 (Fetch translations)
task-1.2 (Query DB) → task-2.1 (Fetch translations)
task-2.1 (Fetch) → task-2.2 (Validate)
task-2.2 (Validate) → task-3.1 (Generate CSV)
task-2.2 (Validate) → task-4.1 (Generate summary)
```

## KEY DIFFERENCES FROM SCRIPT EXECUTION

**OLD Approach (Double-Hop):**
```
Worker → run_terminal_cmd → validate-translations.js → OpenAI API → Result
         (agent 1)           (spawns agent 2)
```

**NEW Approach (Direct):**
```
Worker → LLM tool (built-in) → Result
         (single agent)
```

**Benefits:**
- ✅ No double-hop (worker directly uses LLM)
- ✅ No script execution overhead
- ✅ Better error handling (worker controls flow)
- ✅ Simpler task specifications
- ✅ Faster execution (no subprocess spawning)

## NOTES FOR PM AGENT

- Workers have DIRECT LLM access via built-in tools
- Do NOT specify "run validate-translations.js"
- Do specify "use your LLM tool to validate"
- Batch size: 10 translations per LLM call (to avoid token limits)
- Rate limiting: 1.5 second delay between batches
- Pagination: 100 translations per page (process in batches of 10)
