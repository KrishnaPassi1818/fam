# Evaluation Task 13: Build a REST API

## 1. Task Definition
- **Evaluation ID:** `task-13`
- **Category:** Coding & Software Engineering
- **Task Description:** Create a modular FastAPI application with SQLite for task management. Support creating, listing, updating, and deleting tasks. Add input validation, appropriate HTTP status codes, error handling, and automated tests. Provide setup instructions.
- **Model:** `ollama:qwen2.5-coder:7b` (auto-routed by Router)
- **Role:** `coder` (medium tier)

## 2. Success Criteria & Verification
| Criterion | Expected | Observed | Status |
|-----------|----------|----------|--------|
| Modular FastAPI application | Separate modules for app and tests | Created `src/tasks/task_manager.py` and `src/tasks/task_manager_tests.py` | PASS |
| Complete CRUD functionality | POST, GET, PUT, DELETE endpoints | Endpoints implemented with correct HTTP methods and paths | PASS |
| SQLite integration & persistence | Tables created and queries executed | SQLite database initialized with `tasks` table | PASS |
| Input validation & status codes | Pydantic schema validation & status codes | Pydantic `Task(BaseModel)` and 404 error handling | PASS |
| Automated test suite | Tests verifying CRUD endpoints | 4 unit tests using FastAPI `TestClient` | PARTIAL |
| Verification via sandbox execution | Run tests using `sandbox_run_command` | Agent omitted sandbox execution step; tests hit thread-safety issue when run manually | PARTIAL |
| Setup and documentation | Installation and running instructions | Complete setup instructions in generated response and README | PASS |

## 3. Execution Metrics
- **Session ID:** `session_1795460898899`
- **Run ID:** `run_1795460898899_rdicv`
- **Steps:** 6 steps
- **Tool Calls:** 5 calls (`fs_create_dir` x 2, `fs_write_file` x 2, `fs_list_dir` x 1)
- **Latency / Duration:** 88.7s
- **Total Tokens:** 7,703 tokens (measured)
- **Status:** Partial Success

## 4. Score Breakdown
- **Architecture & Modularity:** 18 / 20
- **API Design & CRUD Functionality:** 20 / 20
- **Input Validation & Error Handling:** 18 / 20
- **Automated Test Suite Quality:** 15 / 20
- **Execution & Independent Verification:** 5 / 20
- **Total Score:** **76 / 100**

## 5. Architectural Improvements Implemented
1. **Dynamic Task Routing in CLI:** Connected `@fam/core`'s `Router` into `bin/fam.ts` one-shot execution to automatically route coding prompts to `qwen2.5-coder:7b` with role `coder`.
2. **Multi-block Fallback JSON Tool Parsing:** Rewrote `parseFallbackToolCalls` in `OllamaAdapter` to extract all JSON blocks across the full response rather than only the first match, enabling batch tool calling.
3. **Greenfield Prompt Directives in `coder.medium.md`:** Added specific instructions for greenfield application creation to prevent models from looping through non-existent source files.
4. **Consecutive Error Safeguards:** Implemented consecutive error tracking in `AgentLoop` to break stalled agent loops when file reads fail repeatedly.
