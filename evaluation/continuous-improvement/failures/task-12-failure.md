# Failure Analysis: Task 12 (Implement an Algorithm with Tests)

## Overview
- **Evaluation ID:** `task-12`
- **Component:** Code Generation, Vitest Test Authoring, Execution Verification
- **Issue:** Test file did not use Vitest; tests were never executed; algorithm had logic flaws.
- **Severity:** High

## Symptoms
User asked:
`"Implement a rate limiter in TypeScript using the token bucket algorithm. The class should support configurable capacity and refill rate, an allowRequest() method that returns boolean, and a getAvailableTokens() method. Write a complete test file using Vitest that verifies: normal consumption, bucket exhaustion, token refill over time, and capacity capping. Run the tests to confirm they pass."`

Observed:
1. `rate_limiter.ts` had a JSON header line on line 1, syntax error.
2. `getAvailableTokens()` returned inverted `capacity - tokens`.
3. `rate_limiter.test.ts` did not use `describe`, `it`, or `expect` from `vitest`.
4. Agent never ran `run_command` to test the code.
5. `vitest run` on the file returned `Error: No test suite found`.

## Root Cause
- Small 8B models need direct structural instruction to format Vitest test files properly (`import { describe, it, expect } from 'vitest'`).
- The agent loop did not enforce that when the user says "Run the tests to confirm they pass", a `run_command` tool call must precede the final answer.

## Remediation Plan
1. In `prompts/roles/assistant.medium.md`:
   - "Tests: Use `import { describe, it, expect } from 'vitest';` for Vitest tests. Always run tests with `run_command` and inspect output before reporting completion."
2. In `AgentLoop`: For tasks requesting test runs, detect if test files were written without a subsequent command execution.
