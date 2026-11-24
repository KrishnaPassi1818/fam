# Task 01: Personal Learning Roadmap

## 1. Original User Request
> "Create a practical 30-day backend development learning roadmap for a beginner who knows Java and basic SQL. I can study for 3 hours daily. Divide it into weekly goals, daily activities, practice tasks, and expected outcomes. Keep the plan realistic."

---

## 2. Execution Environment
- **Evaluation ID:** `task-01-qwen35`
- **Execution Mode:** Local-only (`--local-only --yes`)
- **Working Directory:** `/home/krishna/Projects/harness/fam-evaluation/workspace`
- **Harness:** `fam` (`packages/cli/dist/bin/fam.js`)
- **Active MCP Servers:** `fs`, `sandbox`, `office`, `web`

---

## 3. Model & Role
- **Model:** `ollama:qwen3.5:4b`
- **Role:** `assistant` (medium tier)

---

## 4. Execution Summary
- **Steps:** 1
- **Duration:** 48,210 ms (48.2s)
- **Total Output Tokens:** ~1,100
- **Exit Code:** 0
- **Tool Invocations:** 0 (Direct text response; avoided spurious tool calls)

---

## 5. Tool-Call Sequence
None invoked. Correctly identified this as an analytical planning and reasoning request.

---

## 6. Actual Output and Artifacts
- **Output:** Fully structured 30-day roadmap tailored specifically to Java and SQL background:
  - Week 1: Java Core Refresher & Spring Boot Fundamentals (Java 21, JPA/Hibernate, CRUD, Dependency Injection, ACID, profiles).
  - Week 2: REST APIs & Database Design (REST verbs, Bean validation, JWT auth, SQL optimization/indexing, N+1 query problem, MongoDB intro).
  - Week 3: Testing, Security & Deployment (JUnit, Mockito/TestContainers, Spring Test, CSRF/XSS/RBAC, Docker, GitHub Actions, Prometheus/Grafana).
  - Week 4: Advanced Topics & Capstone Project (Redis caching, async/CompletableFuture, WebSockets, API gateways, CAP theorem, distributed transactions).
  - Capstone Project specification (Days 28–30) and weekly milestone verification checklist.

---

## 7. Independent Verification
- Constraints checked:
  - 30-day timeline: Exactly 30 distinct daily breakdowns partitioned into 4 weekly themes.
  - 3 hours daily: Explicitly budgeted in activities column (3h).
  - Java & basic SQL background: Grounded in Java 21, Spring Boot 3.x, Spring Data JPA, and SQL indexing (avoided irrelevant stacks like Node/Express).
  - Weekly goals, daily activities, practice tasks, expected outcomes: Present in structured markdown tables.
  - Realistic progression: Incremental learning curve ending with a tested, containerized capstone service.

---

## 8. Evaluation Score

| Evaluation Dimension | Max | Awarded | Rationale |
|---|---|---|---|
| Understanding user intent | 10 | 10 | Perfectly adhered to Java/SQL constraints, 3h/day schedule, and 30-day timeline. |
| Planning and decomposition | 10 | 10 | Clear weekly themes, daily activities, practice tasks, outcomes, and capstone. |
| Tool selection and tool-call quality | 15 | 15 | Did not invoke unrequested tools (e.g. avoided creating empty .docx stubs). |
| Tool argument correctness | 10 | 10 | N/A (no tools needed). |
| Execution correctness | 15 | 15 | Complete, accurate, professional-grade curriculum. |
| Independent verification | 10 | 10 | Every constraint verified independently against prompt specifications. |
| Context and token efficiency | 10 | 9 | Complete roadmap generated in a single turn without context bloat. |
| Latency and resource efficiency | 5 | 4 | 48s wall clock, 100% GPU offload on RTX 4050 Laptop GPU. |
| Safety and privacy | 10 | 10 | Strict local execution, zero leaks. |
| Final response quality | 5 | 5 | Excellent GitHub-flavored markdown formatting and table layouts. |
| **Total** | **100** | **98** | **Performance Level: Excellent (90–100)** |

---

## 9. Identified Weaknesses & Failure Classification
- **Classification:** None (`SUCCESS`).
- **Improvement over Baseline:** Baseline score on `llama3.1:8b` was 57/100 due to premature, broken `office_docx_create_from_markdown` invocation and disregarding the Java constraint. `qwen3.5:4b` scored 98/100 with zero unnecessary tool calls and full adherence to Java/SQL constraints.
