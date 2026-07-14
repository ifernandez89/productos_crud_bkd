#!/usr/bin/env bash
# Simple security pattern checker for CI
# Exits with non-zero if dangerous patterns are found

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Patterns to scan
patterns=(
  "\$executeRaw"
  "\$queryRaw"
  "exec\("
  "spawn\("
  "child_process"
  "eval\("
  "::vector"
)

found=0
for p in "${patterns[@]}"; do
  echo "Scanning for pattern: $p"
  if grep -RIn --exclude-dir=node_modules -E "$p" "$ROOT_DIR/src"; then
    found=1
  fi
done

if [ "$found" -ne 0 ]; then
  echo "\nSecurity check failed: one or more dangerous patterns were detected.\n"
  exit 2
fi

echo "Security check passed."