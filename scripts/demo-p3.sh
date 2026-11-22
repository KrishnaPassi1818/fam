#!/usr/bin/env bash
set -e

echo "Running Phase 3 Exit Gate..."
cd "$(dirname "$0")/.."
npx tsx scripts/demo-p3.ts
