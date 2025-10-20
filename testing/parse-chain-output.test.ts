import { describe, it, expect } from 'vitest';
import { parseChainOutput, type TaskDefinition } from '../src/orchestrator/task-executor.js';

describe('parseChainOutput', () => {
  it('should parse a single task with <details> block', () => {
    const markdown = `
### Task ID: task-1.1

#### **Agent Role Description**
Backend engineer with expertise in Node.js and TypeScript.

#### **Recommended Model**
GPT-4.1

#### **Optimized Prompt**
<details>
<summary>Click to expand</summary>

<prompt>
# Task: Implement authentication

## MANDATORY RULES
- Rule 1: Use TypeScript
- Rule 2: Follow best practices

## OUTPUT
Deliver working code.
</prompt>
</details>

#### **Dependencies**
None

#### **Estimated Duration**
2-3 hours
`;

    const tasks = parseChainOutput(markdown);
    
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: 'task-1.1',
      title: 'task-1.1',
      agentRoleDescription: 'Backend engineer with expertise in Node.js and TypeScript.',
      recommendedModel: 'GPT-4.1',
      dependencies: [],
      estimatedDuration: '2-3 hours',
      parallelGroup: undefined,
    });
    expect(tasks[0].prompt).toContain('# Task: Implement authentication');
    expect(tasks[0].prompt).toContain('Use TypeScript');
  });

  it('should parse a task without <details> block', () => {
    const markdown = `
### Task ID: task-2.1

#### **Agent Role Description**
Frontend developer with React expertise.

#### **Recommended Model**
Claude Sonnet 4

#### **Optimized Prompt**
<prompt>
# Build Login Component

Create a login form with email and password fields.
</prompt>

#### **Dependencies**
task-1.1

#### **Estimated Duration**
1-2 hours
`;

    const tasks = parseChainOutput(markdown);
    
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: 'task-2.1',
      agentRoleDescription: 'Frontend developer with React expertise.',
      recommendedModel: 'Claude Sonnet 4',
      dependencies: ['task-1.1'],
      estimatedDuration: '1-2 hours',
    });
  });

  it('should parse multiple tasks', () => {
    const markdown = `
### Task ID: task-1.1

#### **Agent Role Description**
Backend architect.

#### **Recommended Model**
GPT-4.1

#### **Optimized Prompt**
<prompt>
Design the system.
</prompt>

#### **Dependencies**
None

#### **Estimated Duration**
3 hours

---

### Task ID: task-1.2

#### **Agent Role Description**
Database engineer.

#### **Recommended Model**
GPT-4.1

#### **Optimized Prompt**
<prompt>
Create schema.
</prompt>

#### **Dependencies**
task-1.1

#### **Estimated Duration**
2 hours
`;

    const tasks = parseChainOutput(markdown);
    
    expect(tasks).toHaveLength(2);
    expect(tasks[0].id).toBe('task-1.1');
    expect(tasks[1].id).toBe('task-1.2');
    expect(tasks[1].dependencies).toEqual(['task-1.1']);
  });

  it('should parse tasks with multiple dependencies', () => {
    const markdown = `
### Task ID: task-3.1

#### **Agent Role Description**
Integration specialist.

#### **Recommended Model**
GPT-4.1

#### **Optimized Prompt**
<prompt>
Integrate components.
</prompt>

#### **Dependencies**
task-1.1, task-2.1, task-2.2

#### **Estimated Duration**
4 hours
`;

    const tasks = parseChainOutput(markdown);
    
    expect(tasks).toHaveLength(1);
    expect(tasks[0].dependencies).toEqual(['task-1.1', 'task-2.1', 'task-2.2']);
  });

  it('should parse tasks with parallel groups', () => {
    const markdown = `
### Task ID: task-1.1

#### **Parallel Group**
1

#### **Agent Role Description**
Backend developer A.

#### **Recommended Model**
GPT-4.1

#### **Optimized Prompt**
<prompt>
Implement feature A.
</prompt>

#### **Dependencies**
None

#### **Estimated Duration**
2 hours

---

### Task ID: task-1.2

#### **Parallel Group**
1

#### **Agent Role Description**
Backend developer B.

#### **Recommended Model**
GPT-4.1

#### **Optimized Prompt**
<prompt>
Implement feature B.
</prompt>

#### **Dependencies**
None

#### **Estimated Duration**
2 hours
`;

    const tasks = parseChainOutput(markdown);
    
    expect(tasks).toHaveLength(2);
    expect(tasks[0].parallelGroup).toBe(1);
    expect(tasks[1].parallelGroup).toBe(1);
  });

  it('should handle "none" dependencies case-insensitively', () => {
    const markdownLower = `
### Task ID: task-1.1

#### **Agent Role Description**
Developer.

#### **Recommended Model**
GPT-4.1

#### **Optimized Prompt**
<prompt>
Task
</prompt>

#### **Dependencies**
none

#### **Estimated Duration**
1 hour
`;

    const markdownUpper = markdownLower.replace('none', 'None');
    
    const tasksLower = parseChainOutput(markdownLower);
    const tasksUpper = parseChainOutput(markdownUpper);
    
    expect(tasksLower[0].dependencies).toEqual([]);
    expect(tasksUpper[0].dependencies).toEqual([]);
  });

  it('should return empty array for invalid markdown', () => {
    const markdown = `
# Some Random Markdown

This doesn't match the expected format at all.
`;

    const tasks = parseChainOutput(markdown);
    
    expect(tasks).toHaveLength(0);
  });

  it('should handle tasks with complex multi-line prompts', () => {
    const markdown = `
### Task ID: task-1.1

#### **Agent Role Description**
Full-stack developer.

#### **Recommended Model**
Claude Sonnet 4

#### **Optimized Prompt**
<details>
<summary>Click to expand</summary>

<prompt>
# Complex Task

## MANDATORY RULES

**RULE #0: VERIFY CONTEXT ASSUMPTIONS FIRST**
Before starting, verify these:
- ✅ Check \`README.md\`
- ✅ Check \`package.json\`

**RULE #1: IMPLEMENTATION**
- Step 1: Do this
- Step 2: Do that

## OUTPUT FORMAT
1. Code
2. Tests
3. Documentation

## VERIFICATION CHECKLIST
- [ ] Tests pass
- [ ] Code is documented
</prompt>
</details>

#### **Dependencies**
None

#### **Estimated Duration**
4-6 hours
`;

    const tasks = parseChainOutput(markdown);
    
    expect(tasks).toHaveLength(1);
    expect(tasks[0].prompt).toContain('RULE #0');
    expect(tasks[0].prompt).toContain('VERIFICATION CHECKLIST');
    expect(tasks[0].prompt).toContain('Tests pass');
  });

  it('should trim whitespace from all fields', () => {
    const markdown = `
### Task ID:    task-1.1   

#### **Agent Role Description**
   Backend developer with lots of spaces.   

#### **Recommended Model**
   GPT-4.1   

#### **Optimized Prompt**
<prompt>
Task with spaces
</prompt>

#### **Dependencies**
   task-0.1  ,  task-0.2  

#### **Estimated Duration**
   2 hours   
`;

    const tasks = parseChainOutput(markdown);
    
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('task-1.1');
    expect(tasks[0].agentRoleDescription).toBe('Backend developer with lots of spaces.');
    expect(tasks[0].recommendedModel).toBe('GPT-4.1');
    expect(tasks[0].dependencies).toEqual(['task-0.1', 'task-0.2']);
    expect(tasks[0].estimatedDuration).toBe('2 hours');
  });

  it('should extract QC Agent Role', () => {
    const markdown = `
### Task ID: task-1.1

#### **Agent Role Description**
Backend developer with Node.js expertise

#### **Recommended Model**
Claude Sonnet 4

#### **Optimized Prompt**
<prompt>
Build a REST API
</prompt>

#### **Dependencies**
None

#### **Estimated Duration**
2 hours

#### **QC Agent Role**
Senior QA engineer with API testing expertise and security auditing experience

#### **Verification Criteria**
Security:
- [ ] No hardcoded credentials

#### **Max Retries**
2
`;

    const tasks = parseChainOutput(markdown);
    expect(tasks).toHaveLength(1);
    
    const task = tasks[0];
    expect(task.qcRole).toBeDefined();
    expect(task.qcRole).toContain('Senior QA engineer');
    expect(task.qcRole).toContain('security auditing');
  });

  it('should extract Verification Criteria with multiple sections', () => {
    const markdown = `
### Task ID: task-1.1

#### **Agent Role Description**
Backend developer

#### **Recommended Model**
GPT-4.1

#### **Optimized Prompt**
<prompt>
Build API
</prompt>

#### **Dependencies**
None

#### **Estimated Duration**
1 hour

#### **QC Agent Role**
QA Engineer

#### **Verification Criteria**
Security:
- [ ] No hardcoded credentials
- [ ] All endpoints authenticated

Functionality:
- [ ] All CRUD operations implemented

#### **Max Retries**
3
`;

    const tasks = parseChainOutput(markdown);
    expect(tasks).toHaveLength(1);
    
    const task = tasks[0];
    expect(task.verificationCriteria).toBeDefined();
    expect(task.verificationCriteria).toContain('Security:');
    expect(task.verificationCriteria).toContain('No hardcoded credentials');
    expect(task.verificationCriteria).toContain('Functionality:');
  });

  it('should extract Max Retries as number', () => {
    const markdown = `
### Task ID: task-1.1

#### **Agent Role Description**
Backend developer

#### **Recommended Model**
GPT-4.1

#### **Optimized Prompt**
<prompt>
Build API
</prompt>

#### **Dependencies**
None

#### **Estimated Duration**
1 hour

#### **QC Agent Role**
QA Engineer

#### **Verification Criteria**
- [ ] Test 1

#### **Max Retries**
3
`;

    const tasks = parseChainOutput(markdown);
    expect(tasks).toHaveLength(1);
    
    const task = tasks[0];
    expect(task.maxRetries).toBe(3);
    expect(typeof task.maxRetries).toBe('number');
  });

  it('should default maxRetries to 2 when not specified', () => {
    const markdown = `
### Task ID: task-1.1

#### **Agent Role Description**
Backend developer

#### **Recommended Model**
GPT-4.1

#### **Optimized Prompt**
<prompt>
Build API
</prompt>

#### **Dependencies**
None

#### **Estimated Duration**
1 hour
`;

    const tasks = parseChainOutput(markdown);
    expect(tasks).toHaveLength(1);
    
    const task = tasks[0];
    expect(task.maxRetries).toBe(2);
  });

  it('should handle tasks without QC fields (legacy format)', () => {
    const markdown = `
### Task ID: task-1.1

#### **Agent Role Description**
Backend developer

#### **Recommended Model**
GPT-4.1

#### **Optimized Prompt**
<prompt>
Build API
</prompt>

#### **Dependencies**
None

#### **Estimated Duration**
1 hour
`;

    const tasks = parseChainOutput(markdown);
    expect(tasks).toHaveLength(1);
    
    const task = tasks[0];
    expect(task.qcRole).toBeUndefined();
    expect(task.verificationCriteria).toBeUndefined();
    expect(task.maxRetries).toBe(2); // Still has default
  });
});
