#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== Running Phase 6 Exit Gate Demo ==="
cd "${ROOT_DIR}"
pnpm tsx "${SCRIPT_DIR}/demo-p6.ts"
echo "=== Phase 6 Exit Gate Complete ==="
