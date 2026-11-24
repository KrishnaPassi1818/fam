#!/usr/bin/env bash
set -eo pipefail

START_TIME=$(date +%s%N)

echo "============================================================"
echo " FAM Unified Comprehensive Automated Test Runner"
echo "============================================================"

# 1. Rust Workspace Test Execution
echo ""
echo "=== Step 1: Rust Workspace Tests (Cargo) ==="
cargo test --workspace

# 2. TypeScript Workspace Typecheck
echo ""
echo "=== Step 2: TypeScript Workspace Typecheck (tsc -b) ==="
pnpm typecheck

# 3. Vitest Test Suites
echo ""
echo "=== Step 3: Vitest Test Suites Across Monorepo ==="
pnpm test

END_TIME=$(date +%s%N)
DURATION_MS=$(( (END_TIME - START_TIME) / 1000000 ))
DURATION_SEC=$(awk "BEGIN {print $DURATION_MS / 1000}")

echo ""
echo "============================================================"
echo " ALL TEST SUITES PASSED SUCCESSFULLY in ${DURATION_SEC}s"
echo "============================================================"
