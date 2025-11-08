# Ecko Integration Quick Start

## 🎯 What is Ecko?

**Ecko** is a **Prompt Architect** agent that transforms vague, incomplete user requests into structured, comprehensive prompts optimized for task execution.

**Think of Ecko as:** Your requirements analyst + technical architect + project planner rolled into one.

## 🚀 How to Use Ecko in Open WebUI

### 1. Select a Pipeline Mode

Open WebUI now has **3 Mimir pipeline modes**:

| Pipeline | What It Does | Use When |
|----------|--------------|----------|
| **Mimir: Ecko Only** | Transforms your request into structured prompt | You want to refine requirements |
| **Mimir: Ecko → PM** | Ecko + PM task breakdown | You want a complete plan (recommended) |
| **Mimir: Full** | Complete orchestration (experimental) | Testing full workflow |

### 2. Select Your Model

The pipeline uses **whatever model you select** in the dropdown:
- **gpt-4.1** - Best for complex analysis (recommended)
- **gpt-4o** - Faster, good for most tasks
- **gpt-5-mini** - Quick, lightweight processing

### 3. Send Your Request

Just type your request naturally:

```
Build a REST API for user management
```

or

```
Create a dashboard that shows real-time metrics
```

or

```
Design a microservices architecture for e-commerce
```

### 4. Review the Output

The pipeline will stream output in **code-fenced markdown blocks**:

#### Ecko Output (Structured Prompt)
```markdown
# Project: User Management REST API

## Executive Summary
Build a RESTful API for user management with CRUD operations...

## Requirements
### Functional Requirements
1. Users can register with email/password
2. System must authenticate users with JWT
...

## Deliverables
### 1. API Specification
- Format: OpenAPI 3.0 YAML
- Content: Endpoints, schemas, auth
...
```

#### PM Output (Task Plan)
```markdown
# Project Plan: User Management REST API

## Task Breakdown

### Task 1: Design API Schema
- Description: Create OpenAPI specification
- Deliverable: openapi.yaml
- Complexity: Medium
- Dependencies: None

### Task 2: Implement Authentication
- Description: JWT-based auth middleware
- Deliverable: auth.js
- Complexity: High
- Dependencies: Task 1
...
```

## 🎨 What Ecko Does

### Input (Your Vague Request)
```
Build a REST API for user management
```

### Output (Structured Prompt)
Ecko expands this into:

1. **Functional Requirements**
   - User registration, login, logout
   - CRUD operations for user profiles
   - Password reset functionality
   - Email verification

2. **Technical Constraints**
   - RESTful architecture
   - JWT authentication
   - Database schema design
   - API versioning strategy

3. **Success Criteria**
   - All endpoints return proper status codes
   - Authentication works with token refresh
   - Input validation prevents SQL injection
   - API documentation is complete

4. **Deliverables**
   - OpenAPI specification
   - Database schema
   - Authentication middleware
   - Integration tests
   - Deployment guide

5. **Technical Challenges**
   - Token refresh strategy
   - Password hashing algorithm
   - Rate limiting implementation
   - CORS configuration

6. **Guiding Questions**
   - Which database? (PostgreSQL, MySQL, MongoDB)
   - Session management? (Stateless JWT vs. Redis)
   - Email service? (SendGrid, AWS SES)
   - Deployment target? (Docker, serverless, VMs)

## 📋 What PM Does

Takes Ecko's structured prompt and breaks it into **executable tasks**:

```markdown
### Task 1: Design API Schema
- Description: Create OpenAPI 3.0 specification
- Deliverable: openapi.yaml with all endpoints
- Complexity: Medium
- Dependencies: None
- Estimated Time: 2-3 hours

### Task 2: Set Up Database Schema
- Description: Design user table with proper indexes
- Deliverable: migration.sql
- Complexity: Low
- Dependencies: Task 1
- Estimated Time: 1 hour

### Task 3: Implement JWT Authentication
- Description: Auth middleware with token generation/validation
- Deliverable: auth.js with tests
- Complexity: High
- Dependencies: Task 1, Task 2
- Estimated Time: 4-5 hours

[... more tasks ...]

## Execution Order
Task 1 → Task 2 → Task 3 → Task 4 → Task 5
```

## 🎯 Example Workflows

### Example 1: Simple Request

**You:**
```
Create a todo app with React
```

**Ecko expands to:**
- Frontend: React components, state management, routing
- Backend: REST API for todos (CRUD)
- Database: Schema for todos, users
- Auth: User login/registration
- Deployment: Build process, hosting

**PM breaks down into:**
- Task 1: Design component hierarchy
- Task 2: Set up React project with routing
- Task 3: Create todo CRUD components
- Task 4: Implement state management (Context/Redux)
- Task 5: Build backend API
- Task 6: Connect frontend to backend
- Task 7: Add authentication
- Task 8: Deploy to hosting

### Example 2: Complex Request

**You:**
```
Design a microservices architecture for an e-commerce platform
```

**Ecko expands to:**
- Services: User, Product, Order, Payment, Inventory, Notification
- Communication: REST vs. gRPC vs. message queues
- Data: Database per service vs. shared database
- Auth: Centralized auth service vs. distributed
- Observability: Logging, tracing, metrics
- Deployment: Kubernetes, service mesh, CI/CD

**PM breaks down into:**
- Task 1: Architecture diagram (services + communication)
- Task 2: API contracts for each service
- Task 3: Database schema for each service
- Task 4: Service discovery strategy
- Task 5: Authentication/authorization design
- Task 6: Observability stack setup
- Task 7: Deployment manifests (Kubernetes)
- Task 8: CI/CD pipeline design

## 🔧 Configuration

### Change Default Model

In Open WebUI:
1. Go to **Settings** → **Admin Panel** → **Pipelines**
2. Find **Mimir Orchestrator**
3. Click **Settings** (gear icon)
4. Update **DEFAULT_MODEL** to your preferred model
5. Save

### Enable/Disable Agents

In pipeline settings:
- **ECKO_ENABLED**: true/false (enable Ecko stage)
- **PM_ENABLED**: true/false (enable PM stage)
- **WORKERS_ENABLED**: false (experimental, not yet implemented)

## 📊 Output Format

All outputs are displayed as **code-fenced markdown** in the chat window:

```markdown
## 🎨 Ecko Structured Prompt

```markdown
[Ecko's structured prompt here]
```

✅ **Structured prompt ready for PM**

## 📋 PM Task Plan

```markdown
[PM's task breakdown here]
```

✅ **Task plan ready for review**
```

**Why code-fenced?**
- Easy to copy/paste
- Preserves formatting
- Syntax highlighting
- Can be saved to files manually

## 🎯 Best Practices

### 1. Be Specific About Constraints

**Instead of:**
```
Build a web app
```

**Try:**
```
Build a web app using React (no Redux), Node.js backend, PostgreSQL database
```

### 2. Mention Your Context

**Instead of:**
```
Add authentication
```

**Try:**
```
Add JWT authentication to my existing Express.js API
```

### 3. Specify Deliverables

**Instead of:**
```
Design the system
```

**Try:**
```
Design the system - need architecture diagram, API spec, and database schema
```

### 4. Use Ecko for Refinement

If PM's output isn't detailed enough:
1. Copy PM's output
2. Send it back through Ecko with: "Expand this plan with more details"
3. Review the refined output

## 🐛 Troubleshooting

### Pipeline not showing up?

1. Check Open WebUI logs:
   ```bash
   docker logs mimir-open-webui
   ```

2. Verify pipeline file exists:
   ```bash
   docker exec mimir-open-webui ls -la /app/pipelines/
   ```

3. Restart Open WebUI:
   ```bash
   docker-compose restart open-webui
   ```

### Model not being used?

The pipeline uses **whatever model you select** in the dropdown. Make sure you've selected a model (gpt-4.1, gpt-4o, or gpt-5-mini).

### Output not streaming?

Check your internet connection and copilot-api status:
```bash
curl http://localhost:4141/v1/models
```

### Ecko output too verbose?

Use **Mimir: Ecko Only** mode and refine the output yourself, then manually pass it to PM.

## 📚 Next Steps

1. **Test Ecko**: Try "Mimir: Ecko Only" with a simple request
2. **Full Pipeline**: Try "Mimir: Ecko → PM" for complete planning
3. **Iterate**: Refine prompts based on output quality
4. **Save Plans**: Copy code-fenced output to files for execution

## 🎉 Summary

**What you have:**
- ✅ Ecko transforms vague requests into structured prompts
- ✅ PM breaks structured prompts into executable tasks
- ✅ Uses your selected model (gpt-4.1, gpt-4o, gpt-5-mini)
- ✅ Outputs code-fenced markdown for easy review
- ✅ Streams results in real-time

**How to use:**
1. Select "Mimir: Ecko → PM" pipeline
2. Select your model (gpt-4.1 recommended)
3. Type your request
4. Review the structured prompt and task plan
5. Copy and execute!

---

**Version**: 1.0.0  
**Last Updated**: 2025-11-06  
**Status**: ✅ Production Ready
