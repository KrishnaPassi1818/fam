#!/usr/bin/env bash
set -e

echo "=== Running Phase 7 Exit Gate Demo ==="
cd "$(dirname "$0")/.."

pnpm --filter="@hx/office" build
pnpm --filter="@hx/evals" build

pnpm exec tsx scripts/demo-p7.ts
