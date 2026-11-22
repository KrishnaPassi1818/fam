#!/usr/bin/env bash
set -e

echo "Running Phase 4 Exit Gate..."
cd "$(dirname "$0")/.."
npx tsx scripts/demo-p4.ts
