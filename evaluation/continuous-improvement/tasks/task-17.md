# Evaluation Task 17: Build a Java Utility

## 1. Task Definition
- **Evaluation ID:** `task-17`
- **Category:** Code Generation & Software Engineering
- **Task Description:** Create a Java command-line application that manages a simple contact list. Support adding, searching, listing, and removing contacts. Use appropriate classes and collections. Include error handling and tests if the existing project supports them. Provide instructions to compile and run it.
- **Model:** `ollama:qwen2.5-coder:7b` (auto-routed by Router)
- **Role:** `coder` (medium tier)

## 2. Success Criteria & Verification
| Criterion | Expected | Observed | Status |
|-----------|----------|----------|--------|
| Java source file creation | Contact class and CLI main class in `.java` files | 0 `.java` files created; agent invoked `todo` 15 times | FAIL |
| Contact list CRUD features | Add, search, list, remove contacts | Outlined in todo items, but never implemented in code | FAIL |
| Collections and error handling | `ArrayList` or `HashMap`, input validation | Specified in todo planning, but zero code generated | FAIL |
| Compilation & Execution | Compiles with `javac` and runs with `java` | Never compiled or executed | FAIL |

## 3. Execution Metrics
- **Session ID:** `session_1795461404052`
- **Run ID:** `run_1795461404052_b7654`
- **Steps:** 2 steps
- **Tool Calls:** 17 calls (`todo` x 15, `fs_list_dir` x 1, `fs_repo_map` x 1)
- **Latency / Duration:** 32.8s
- **Total Tokens:** 1,723 tokens (measured)
- **Status:** Failed (Stalled in planning/todo loop)

## 4. Score Breakdown
- **Architecture & Object Design:** 10 / 25
- **Implementation & File Generation:** 0 / 25
- **Error Handling & Collections:** 0 / 25
- **Testing, Compilation & Instructions:** 10 / 25
- **Total Score:** **20 / 100**

## 5. Root Cause & Architectural Diagnosis
- **Failure Cause:** The agent became distracted by the built-in `todo` planning tool, creating 15 micro-tasks in the todo list instead of taking action to write the source files with `fs_write_file`.
- **Resolution:** In `prompts/core.md` or `coder.medium.md`, emphasize Action First: "Do not spend turns adding extensive todo items when asked to build an application or utility. Directly write the code files using `fs_write_file`."
