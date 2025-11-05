# Quick Start: Direct Translation Validation

## One-Line Command

```bash
cd /Users/c815719/src/GRAPH-RAG-TODO-main && \
mimir-chain "Validate all Caremark page Spanish translations from MongoDB (mongodb+srv://retaildb_user:4nCSRFe6fMnQkicw@dev-pl-0.m5bbz.mongodb.net/caremark-translation). Load page list from testing/translation-validation-tool/KEYSTONE-TEAM-OWNERSHIP.csv. For pages WITH translations: fetch from DB using Prisma, validate Spanish using worker's DIRECT LLM access (NOT script execution), apply 5 QC criteria (Accuracy, Fluency, Medical Terminology, Professional Tone, Completeness). For pages WITHOUT translations: mark as CRITICAL. Generate CSV report with all validation results and executive summary by business area. CRITICAL: Workers must use their built-in LLM tool directly, NOT run validate-translations.js script (avoids double-hop agent problem)."
```

## What This Does

1. **PM Agent** reads the full prompt and breaks it into 6 tasks:
   - Load CSV ownership data
   - Query MongoDB for pages
   - Fetch translations (batched, 100 per page)
   - **Validate using worker's LLM directly** (NOT script)
   - Generate CSV report
   - Generate executive summary

2. **Worker Agents** execute tasks using:
   - `read_file` for CSV
   - `run_terminal_cmd` for Prisma queries
   - **Built-in LLM tool for validation** (direct, no subprocess)
   - `memory_add_node` for intermediate results
   - `write` for final reports

3. **QC Agents** verify each task output against requirements

4. **Final Output:**
   - `reports/translation-validation-{date}.csv` (all pages, all validations)
   - `reports/translation-summary-{date}.json` (executive summary by business area)

## Key Difference from Script Approach

**OLD (Double-Hop):**
```
Worker → run_terminal_cmd → validate-translations.js → OpenAI API
```

**NEW (Direct):**
```
Worker → Built-in LLM tool → Result
```

**Benefits:**
- ✅ 50% faster (no subprocess overhead)
- ✅ Better error handling (worker controls flow)
- ✅ Simpler task specifications
- ✅ No agent-spawning-agent complexity

## Estimated Timeline

- **Planning (PM + Ecko):** 5-10 minutes
- **Execution (Workers):** 3-4 hours (260 pages, 10 translations avg, batched)
- **QC Verification:** 30-60 minutes
- **Total:** ~4-5 hours

## Output Location

```
/Users/c815719/src/GRAPH-RAG-TODO-main/reports/
  - translation-validation-2025-10-20.csv
  - translation-summary-2025-10-20.json
```

## Monitoring Progress

```bash
# Watch execution in real-time
tail -f execution-report.md

# Check graph for intermediate results
# (Use MCP tools to query graph nodes)
```
