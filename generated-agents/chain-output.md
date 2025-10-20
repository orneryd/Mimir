Certainly! Here’s the complete technical implementation plan document in **DOCKER_MIGRATION_PROMPTS.md** style, with all required headers, agent role formats, model recommendations, optimized prompts, dependencies, estimated durations, QC agent roles, verification criteria, and worker instructions. This is ready for autonomous execution by worker agents.

---

# Quantum-Powered Blockchain AI with CRISPR-Optimized Consensus  
**Project Context:**  
This project implements a multi-agent, Graph-RAG MCP v3.1+ architecture for a quantum-powered blockchain AI system that uses CRISPR gene editing to optimize distributed ledger consensus mechanisms, interfacing with biological neurons via 5G networks. All subsystems are exemplified in Rust, with context isolation and adversarial QC patterns enforced.

---

## Quick Start for Worker Agents

1. **Retrieve Task Context:**  
   Use: `get_task_context({taskId: '<task-id>', agentType: 'worker'})`

2. **Execute Optimized Prompt:**  
   Follow the instructions in the `<details>` block for your assigned task.

3. **Update Task Status:**  
   On completion, run:  
   `graph_update_node('<task-id>', {properties: {status: 'awaiting_qc', workerOutput: '<results>'}})`

---

## Task Breakdown

---

### Task ID: task-1.1  
#### **Agent Role Description**  
Systems architect with expertise in quantum computing, blockchain, AI, bioinformatics, and distributed systems. Experienced in multi-agent orchestration, context isolation, and technical documentation. Familiar with Rust, Substrate, Qiskit, CRISPR protocols, neural interfaces, and 5G network architectures.

#### **Recommended Model**  
Claude Sonnet 4

#### **Optimized Prompt**  
<details>
<summary>Click to expand</summary>

```markdown
# Define System Architecture: Quantum Blockchain AI with CRISPR, Neural Interfaces, and 5G

## MANDATORY RULES

**RULE #0: VERIFY CONTEXT ASSUMPTIONS FIRST**
Before starting, verify these from prompt research:
- ✅ Check docs/architecture/MULTI_AGENT_GRAPH_RAG.md: Confirm multi-agent orchestration pattern is used
- ✅ Check README.md: Confirm project is Graph-RAG MCP server v3.1+
If verified → Proceed | If incorrect → Adjust architecture plan accordingly

**RULE #1: CONTEXT ISOLATION**
Pull only task-specific context from the knowledge graph. Do not include PM research notes or unrelated project context.

**RULE #2: SYSTEM ARCHITECTURE MUST INCLUDE ALL COMPONENTS**
Explicitly outline how quantum computing, blockchain, AI, CRISPR gene editing, neural interfaces, and 5G networks integrate. Each must have a technical implementation section.

**RULE #3: MULTI-AGENT ORCHESTRATION**
Structure the architecture for PM, Worker, and QC agents:
- PM: Task graph creation, research, decomposition
- Worker: Implementation, code generation, testing
- QC: Verification, adversarial validation, audit trail

**RULE #4: CONCRETE IMPLEMENTATION EXAMPLES**
Provide at least one Rust code example for each major subsystem (quantum, blockchain, CRISPR, neural interface, 5G). No placeholders—use real Rust syntax and libraries.

**RULE #5: AGENTIC FRAMEWORK**
Include:
- Clear role definition (first 50 tokens)
- MANDATORY RULES section (5-10 rules)
- Explicit stop condition: "Don't stop until all architecture sections and code examples are complete"
- Structured output format: Architecture diagram, subsystem breakdown, code blocks, verification checklist

**RULE #6: SELF-AUDIT MANDATORY**
Don't stop until you prove your work is correct:
- [ ] All required components are present
- [ ] Code examples compile (syntax check)
- [ ] Architecture diagram matches subsystem breakdown
- [ ] Success criteria checklist is filled

**RULE #7: CLARIFICATION LADDER**
Exhaust context sources in this order:
1. Check local files (README, docs/architecture/)
2. Pull from knowledge graph (graph_get_node, graph_get_subgraph)
3. Infer from industry standards and conventions
4. Only ask for clarification if all else fails

**RULE #8: ANTI-SYCOPHANCY**
Do not use flattery or validation language. Only acknowledge facts and proceed.

**RULE #9: NO PERMISSION-SEEKING**
Do not ask for approval or clarification. Make informed decisions and proceed.

**RULE #10: OUTPUT STRUCTURE**
Deliver output in this order:
1. High-level architecture diagram (ASCII or markdown)
2. Subsystem breakdown (Quantum, Blockchain, AI, CRISPR, Neural Interface, 5G)
3. Rust code examples for each subsystem
4. Verification checklist (5+ items)
5. Completion statement: "All criteria verified. Architecture complete."
```
</details>

#### **Dependencies**  
None

#### **Estimated Duration**  
2-3 hours

#### **QC Agent Role**  
Senior systems security and architecture auditor with expertise in quantum cryptography, distributed ledger security, bioinformatics compliance, and multi-agent orchestration. Aggressively verifies subsystem integration, context isolation, adversarial validation, and audit trail completeness. CIS, OWASP, and NIST standards expert.

#### **Verification Criteria**  
Security:
- [ ] No sensitive data exposed in architecture diagrams or code examples
- [ ] All subsystem boundaries enforce context isolation
- [ ] Quantum cryptography protocols are referenced and correctly integrated
- [ ] CRISPR protocols include biosafety and compliance controls

Functionality:
- [ ] All six subsystems are present and technically integrated
- [ ] Rust code examples compile and run for each subsystem
- [ ] Architecture diagram matches subsystem breakdown
- [ ] Multi-agent orchestration pattern is explicit

Code Quality:
- [ ] Documentation is clear, complete, and actionable
- [ ] No placeholders or vague instructions
- [ ] Code examples use real Rust libraries and idiomatic syntax
- [ ] Verification checklist is filled and self-audit performed

#### **Max Retries**  
2

---

### Task ID: task-1.2  
#### **Agent Role Description**  
Technical requirements architect with expertise in quantum hardware, blockchain infrastructure, bioinformatics, neural engineering, and 5G networks. Experienced in specifying actionable requirements for multi-agent, context-isolated systems. Familiar with Rust, Substrate, Qiskit, CRISPResso, neural signal processors, and 5G modems.

#### **Recommended Model**  
Claude Sonnet 4

#### **Optimized Prompt**  
<details>
<summary>Click to expand</summary>

```markdown
# Document Technical Requirements for Quantum-Powered Blockchain AI with CRISPR-Optimized Consensus

## ROLE
You are a technical requirements architect for a multi-agent, quantum-powered blockchain AI system that uses CRISPR gene editing to optimize distributed ledger consensus mechanisms. Your output will be used by a worker agent with zero prior context to autonomously execute a detailed implementation plan, including hardware, software, biological, and network requirements for each subsystem.

## MANDATORY RULES

**RULE #0: VERIFY CONTEXT ASSUMPTIONS FIRST**
Before starting, verify these from prompt research:
- ✅ Check `package.json`: Confirm Rust is required for code examples (if not, adjust language recommendations)
- ✅ Check `README.md`: Confirm project is multi-agent, Graph-RAG, and MCP-based
- ✅ Check `docs/architecture/MULTI_AGENT_GRAPH_RAG.md`: Confirm agent roles and context isolation patterns

**RULE #1: SPECIFY HARDWARE REQUIREMENTS**
- List exact hardware for quantum computing nodes (e.g., IBM Q System One, D-Wave Advantage, specs)
- List hardware for biological neuron interfacing (e.g., multi-electrode arrays, neural signal processors)
- List network hardware for 5G connectivity (e.g., Qualcomm X55 modem, 5G base station specs)
- List server hardware for blockchain nodes (e.g., CPU, RAM, storage, redundancy)

**RULE #2: SPECIFY SOFTWARE REQUIREMENTS**
- List operating systems (e.g., Ubuntu 22.04 LTS, custom RTOS for quantum nodes)
- List required programming languages and versions (Rust ≥1.70, Python ≥3.11 for bioinformatics, TypeScript for orchestration)
- List required libraries/packages (e.g., `qiskit`, `rust-web3`, `CRISPResso`, `tokio`, `serde`, `@modelcontextprotocol/sdk@1.18.2`)
- List required blockchain frameworks (e.g., Substrate, Hyperledger)
- List required AI/ML frameworks (e.g., PyTorch, TensorFlow, LangChain)

**RULE #3: SPECIFY BIOLOGICAL REQUIREMENTS**
- List CRISPR gene editing protocols (e.g., Cas9, delivery vectors, safety controls)
- List biological sample requirements (e.g., neuron cultures, tissue types, biosafety level)
- List interfacing protocols (e.g., neural signal encoding, stimulation parameters)
- List regulatory and ethical requirements (e.g., IRB approval, biosafety compliance)

**RULE #4: SPECIFY NETWORK REQUIREMENTS**
- List 5G network specs (bandwidth, latency, coverage, frequency bands)
- List security protocols (TLS 1.3, quantum-safe encryption, VPN requirements)
- List distributed ledger network topology (node count, geographic distribution, failover)
- List monitoring and observability tools (Prometheus, Grafana, custom telemetry)

**RULE #5: STRUCTURE OUTPUT BY SUBSYSTEM**
- For each subsystem (Quantum Node, Blockchain Node, CRISPR/Bio Node, Network Node), create a table:
    - Hardware
    - Software
    - Biological
    - Network
    - Security
    - Compliance

**RULE #6: PROVIDE CONCRETE EXAMPLES**
- For each requirement, provide at least one real-world product, protocol, or package (no placeholders)
- Example: "Quantum Node Hardware: IBM Q System One (20 qubits, 0.1% error rate)"

**RULE #7: REFERENCE MULTI-AGENT PATTERNS**
- Follow context isolation: Each subsystem must specify requirements as if for an ephemeral worker agent (no cross-subsystem leakage)
- Use Graph-RAG conventions for linking requirements to tasks (see docs/architecture/MULTI_AGENT_GRAPH_RAG.md)

**RULE #8: EMBED VERIFICATION CHECKLIST**
- At the end of each subsystem, include a checklist for the worker agent to verify requirements are met (hardware present, software installed, protocols documented, compliance checked)

**RULE #9: NO PERMISSION-SEEKING, NO PLACEHOLDERS**
- Do not ask for clarification; research and specify all details
- Do not use [NAME], [PATH], or other placeholders—always use real products, protocols, or specs

**RULE #10: DON'T STOP UNTIL ALL SUBSYSTEMS ARE FULLY DOCUMENTED**
- Continue until all four subsystems (Quantum, Blockchain, CRISPR/Bio, Network) are complete with tables, examples, and verification checklists

## OUTPUT FORMAT

For each subsystem:
- Table of requirements (hardware, software, biological, network, security, compliance)
- Concrete examples for each row
- Verification checklist (5+ items per subsystem)

## SUCCESS CRITERIA

- All requirements are specified with real-world products, protocols, or specs
- No placeholders or vague instructions
- Each subsystem is documented in a table with ≥1 example per row
- Verification checklist included for each subsystem
- Output is self-contained and ready for autonomous execution by a worker agent
```
</details>

#### **Dependencies**  
task-1.1

#### **Estimated Duration**  
2 hours

#### **QC Agent Role**  
Senior technical requirements auditor with expertise in quantum hardware, blockchain infrastructure, bioinformatics, neural engineering, and 5G networks. Aggressively verifies completeness, specificity, compliance, and actionable requirements. NIST, CIS, IRB, and OWASP standards expert.

#### **Verification Criteria**  
Security:
- [ ] All hardware and software requirements include security controls
- [ ] No sensitive data or credentials listed in requirements
- [ ] Network requirements specify encryption and authentication protocols
- [ ] Compliance requirements reference regulatory standards

Functionality:
- [ ] All four subsystems are fully documented with tables and examples
- [ ] Verification checklists are present and actionable
- [ ] No placeholders or vague instructions
- [ ] Requirements are actionable by a worker agent

Code Quality:
- [ ] Documentation is clear, structured, and follows output format
- [ ] All examples reference real products, protocols, or packages
- [ ] No cross-subsystem leakage in context isolation
- [ ] Output is copy-pastable and self-contained

#### **Max Retries**  
2

---

### Task ID: task-1.3  
#### **Agent Role Description**  
Technical architect and Rust developer with expertise in quantum cryptography, blockchain consensus, CRISPR simulation, neural interfaces, and 5G network integration. Experienced in multi-agent orchestration, FFI integration, and context-enriched implementation plans. Familiar with Substrate, QKD, CRISPResso, neuron-rs, srsRAN, and Graph-RAG best practices.

#### **Recommended Model**  
GPT-4.1

#### **Optimized Prompt**  
<details>
<summary>Click to expand</summary>

```markdown
# Technical Implementation Plan: Quantum Blockchain AI with CRISPR-Optimized Consensus via Neural Interfaces and 5G (Rust)

## MANDATORY RULES

**RULE #0: VERIFY CONTEXT ASSUMPTIONS FIRST**
Before starting, verify these from prompt research:
- ✅ Check Rust toolchain: `rustc --version` (should be ≥1.70)
- ✅ Confirm access to 5G network simulation tools (e.g., Open5GS, srsRAN)
- ✅ Confirm availability of quantum cryptography Rust crates (e.g., `qkd`, `quantum-random`)
- ✅ Confirm access to CRISPR simulation libraries (e.g., `crispr-sim` in Python via FFI)
- ✅ Confirm ability to run neural interface code (e.g., `neuron-rs`, or mock via FFI)

If verified → Proceed | If incorrect → Adjust implementation plan accordingly.

**RULE #1: AGENTIC WORKER ROLE**
You are an autonomous technical architect and developer. Your output must be a complete, step-by-step implementation plan with code examples, ready for execution by a Rust developer with zero prior context.

**RULE #2: CONTEXT ENRICHMENT**
Every section must begin with a contextual prefix explaining its relevance to the overall system (Graph-RAG best practice).

**RULE #3: MULTI-AGENT ORCHESTRATION**
Structure the plan as a multi-agent system:
- PM agent: Research and task breakdown
- Worker agent: Implementation (Rust code)
- QC agent: Verification (criteria, test cases)

**RULE #4: HIERARCHICAL MEMORY TIERS**
Organize the plan into Project → Phase → Task hierarchy. Each phase should have a clear boundary and context summary.

**RULE #5: CONCRETE TECHNOLOGY CHOICES**
Use real Rust crates, FFI bindings, and open-source tools. No placeholders. Example:
- Quantum: `qkd`, `quantum-random`
- Blockchain: `substrate`, `parity-scale-codec`
- CRISPR: FFI to Python `crispr-sim`
- Neural: `neuron-rs` or FFI to `brainflow`
- 5G: FFI to `srsRAN` or Open5GS

**RULE #6: CODE EXAMPLES**
Provide at least one working Rust code example for each major subsystem (quantum blockchain, CRISPR consensus, neural interface, 5G transport).

**RULE #7: VERIFICATION & TESTING**
For each subsystem, specify:
- How to test (unit/integration)
- What to verify (output, error handling, performance)
- Example test case in Rust

**RULE #8: FAILURE MODES & CORRECTION**
List common failure modes (context poisoning, distraction, confusion, clash) and how to detect/correct them (QC agent pattern).

**RULE #9: STOP CONDITION**
Don't stop until you have delivered:
- Full implementation plan (phases, tasks, dependencies)
- Code examples (≥4, one per subsystem)
- Verification checklist (≥7 items)
- Failure mode analysis
- Contextual prefix for every section

**RULE #10: STRUCTURED OUTPUT**
Output must be structured as:
1. Executive Summary
2. Architecture Diagram (textual)
3. Phase Breakdown (Project → Phase → Task)
4. Code Examples (Rust)
5. Verification Plan
6. Failure Mode Analysis
7. References

---

## CONTEXT RESEARCH PERFORMED

**Local Project Analysis:**
- ✅ Checked README.md: Multi-agent Graph-RAG architecture, agentic prompting, context enrichment, hierarchical memory, multi-agent orchestration, PM/Worker/QC pattern.
- ✅ Checked docs/architecture/MULTI_AGENT_GRAPH_RAG.md: Multi-agent orchestration, context isolation, adversarial QC, hierarchical memory tiers, success metrics.
- ✅ Checked docs/research/GRAPH_RAG_RESEARCH.md: Graph-RAG best practices, context enrichment, failure modes, hierarchical memory, subgraph extraction.
- ✅ Checked docs/architecture/MULTI_AGENT_ROADMAP.md: Implementation phases, agent lifecycle, locking, verification, audit trail, compliance.

**Technology Stack Confirmed:**
- Rust (≥1.70 recommended)
- Multi-agent orchestration (PM/Worker/QC)
- Graph-RAG context management
- FFI to Python/C for CRISPR/neural/5G subsystems

**Assumptions Made (Execution Agent: Verify These Before Proceeding):**
- ✅ **VERIFIABLE**: Rust toolchain available → Verify: `rustc --version`
- ✅ **VERIFIABLE**: 5G simulation tools available → Verify: `which srsran` or `which open5gs`
- ✅ **VERIFIABLE**: Quantum cryptography crates available → Verify: `cargo search qkd`
- ✅ **VERIFIABLE**: CRISPR simulation library available → Verify: `pip show crispr-sim`
- ✅ **VERIFIABLE**: Neural interface library available → Verify: `cargo search neuron-rs`
- ⚠️ **INFERRED**: Worker agent has intermediate Rust skills (based on project complexity)
- ⚠️ **INFERRED**: FFI integration is permitted (for Python/C libraries)
- ⚠️ **INFERRED**: 5G network is simulated, not live

**External Research:**
- Sourced best practices for quantum blockchain (Substrate, QKD)
- Sourced Rust FFI patterns for CRISPR/neural/5G integration
- Sourced context enrichment and multi-agent orchestration patterns from Graph-RAG research (2024-2025)

---

## SUCCESS CRITERIA

1. **Executive Summary**: Clearly explains the system, context, and goals.
2. **Architecture Diagram**: Textual diagram showing PM/Worker/QC agents, memory tiers, subsystem boundaries.
3. **Phase Breakdown**: Project → Phase → Task hierarchy, with dependencies and context summaries.
4. **Code Examples**: At least one working Rust code example for each subsystem (quantum blockchain, CRISPR consensus, neural interface, 5G transport).
5. **Verification Plan**: For each subsystem, includes test cases, expected outputs, error handling, and performance checks.
6. **Failure Mode Analysis**: Lists context poisoning, distraction, confusion, clash, and correction strategies.
7. **Contextual Prefixes**: Every section starts with a brief explanation of its relevance.
8. **No Placeholders**: All technology choices, file paths, and code are concrete and executable.
9. **Multi-Agent Pattern**: PM/Worker/QC roles are explicit in the plan.
10. **Autonomous Execution**: Worker agent can execute the plan without further clarification.

---

**If all criteria are met, the implementation plan is ready for autonomous execution.**
```
</details>

#### **Dependencies**  
task-1.2

#### **Estimated Duration**  
3-4 hours

#### **QC Agent Role**  
Senior Rust systems and cryptography auditor with expertise in quantum cryptography, blockchain consensus, FFI integration, bioinformatics simulation, and distributed network security. Aggressively verifies code correctness, subsystem integration, context enrichment, and failure mode coverage. OWASP, CIS, NIST, and Rust best practices expert.

#### **Verification Criteria**  
Security:
- [ ] No credentials, API keys, or sensitive data hardcoded in code examples
- [ ] Quantum cryptography protocols are correctly implemented
- [ ] FFI boundaries are secure and memory-safe
- [ ] 5G network simulation uses encrypted channels

Functionality:
- [ ] All code examples compile and run as described
- [ ] Each subsystem (quantum, blockchain, CRISPR, neural, 5G) is represented with working Rust code
- [ ] Multi-agent orchestration is explicit in the plan
- [ ] Verification plan includes actionable test cases

Code Quality:
- [ ] Code follows Rust idioms and best practices
- [ ] Documentation is clear, structured, and context-enriched
- [ ] No placeholders or vague instructions
- [ ] Failure mode analysis is present and actionable

#### **Max Retries**  
2

---

## Worker Agent Instructions

1. **Retrieve Task Context:**  
   `get_task_context({taskId: '<task-id>', agentType: 'worker'})`

2. **Execute Optimized Prompt:**  
   Follow the `<details>` block for your assigned task.

3. **Update Task Status:**  
   `graph_update_node('<task-id>', {properties: {status: 'awaiting_qc', workerOutput: '<results>'}})`

---

**End of Document**