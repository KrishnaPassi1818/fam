#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"
echo "Building Rust fam-fs server..."
cargo build --package fam-fs

echo "Running Phase 2 Exit Gate Demo..."
pnpm tsx scripts/demo-p2.ts
