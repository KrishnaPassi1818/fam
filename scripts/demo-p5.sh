#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== Running Phase 5 Exit Gate Demo ==="
cd "${ROOT_DIR}"
pnpm tsx "${SCRIPT_DIR}/demo-p5.ts"
echo "=== Phase 5 Exit Gate Complete ==="
