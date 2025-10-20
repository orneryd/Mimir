# Test Task - Simple

## Task ID: test-1.0

### Task: Read package.json
**Task ID**: test-1.0  
**Agent Role Description**: File Reader - Read and summarize the package.json file  
**Estimated Duration**: 1 minute  
**Task Prompt**: Read the package.json file and tell me the project name and version number.  
**PM-Suggested Model**: copilot/gpt-4.1  
**Verification Criteria**: Output contains the project name "mimir" and a version number  
**Dependencies**: None

---

## Task ID: test-2.0

### Task: List source files
**Task ID**: test-2.0  
**Agent Role Description**: Directory Explorer - List TypeScript files in src directory  
**Estimated Duration**: 1 minute  
**Task Prompt**: List all .ts files in the src/ directory (not build/). Count how many files there are.  
**PM-Suggested Model**: copilot/gpt-4.1  
**Verification Criteria**: Output lists .ts files from src/ and provides an accurate count  
**Dependencies**: None
