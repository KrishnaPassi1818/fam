# Evaluation Task 12: Implement an Algorithm with Tests

## 1. Task Definition
- **Evaluation ID:** `task-12`
- **Category:** Code Generation & Software Engineering
- **Task Description:** Implement a rate limiter in TypeScript using the token bucket algorithm. The class should support configurable capacity and refill rate, an `allowRequest()` method that returns boolean, and a `getAvailableTokens()` method. Write a complete test file using Vitest that verifies: normal consumption, bucket exhaustion, token refill over time, and capacity capping. Run the tests to confirm they pass.
- **Model:** `ollama:llama3.1:8b` (local-only)
- **Role:** `assistant` (medium tier)

## 2. Success Criteria & Verification
| Criterion | Expected | Observed | Status |
|-----------|----------|----------|--------|
| TypeScript Implementation | Exported class with configurable capacity and refill rate | Class written, but prefixed with invalid JSON header line; inverted `getAvailableTokens` | PARTIAL |
| Token Bucket Algorithm | Correct math for refill per second and capping | Refill multiplied milliseconds directly by rate without scaling to seconds; initial tokens = capacity | PARTIAL |
| Vitest Test Suite | Uses `describe`, `it`, `expect` for all 4 scenarios | Wrote standalone script using `console.error` and `setTimeout`; zero Vitest assertions | FAIL |
| Tests Executed & Passing | Executed via `run_command` / `sandbox_run_command` | Agent never ran tests; Vitest reported `No test suite found` | FAIL |
| Types & Cleanliness | Clean typed code | Class was not exported; syntax error on line 1 | FAIL |

## 3. Execution Metrics
- **Session ID:** `session_1795459359367`
- **Run ID:** `run_1795459359367_pms8a`
- **Steps:** 2 steps
- **Tool Calls:** 2 calls (`fs_write_file` x 2)
- **Latency / Duration:** 75.5s
- **Total Tokens:** 1120 tokens (measured)
- **Trace Log:** `evaluation/continuous-improvement/traces/task-12.jsonl`

## 4. Root Cause Analysis
1. **Vitest Paradigm Failure:** Local 8B models frequently emit procedural `console.log` / `setTimeout` scripts rather than structured Vitest test suites (`import { describe, it, expect } from 'vitest'`) unless the test structure is emphasized in system prompts.
2. **Missing Test Execution Turn:** The agent completed its run without executing `run_command("pnpm test" or "vitest run")`, claiming that "Running the tests with Vitest should confirm that they pass" rather than observing real test results.
3. **API Logic Flaws:**
   - Inverted token calculation: `getAvailableTokens() { return this.capacity - this.tokens; }` (calculates used tokens rather than available tokens).
   - Millisecond vs Second Refill Rate: Multiplied `rate * (timestamp - lastRefill)` without dividing elapsed milliseconds by 1000.

## 5. Architectural Improvements Planned
- **Role Prompt Enhancement:** Update `prompts/roles/assistant.medium.md` and coder role to explicitly enforce:
  - "When asked to write Vitest tests, use `import { describe, it, expect } from 'vitest';` with standard `describe` and `it` blocks."
  - "When asked to run tests to confirm they pass, always execute the test command via `run_command` before concluding."

## 6. Scoring
- **Task Completion Score:** 30 / 100
- **Efficiency Score:** 50 / 100
- **Safety / Policy Adherence:** 80 / 100
- **Overall Score:** **30 / 100** (Failed)
