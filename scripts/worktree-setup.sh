#!/usr/bin/env bash
# Prepares a fresh git worktree (T3 Code thread, agent writer or by hand).
# Safe to re-run. Usage: scripts/worktree-setup.sh [worktree-path]
set -euo pipefail

cd "${1:-$(git rev-parse --show-toplevel)}"

mise trust --quiet .
mise install --quiet
mise exec -- pnpm install --frozen-lockfile --reporter=silent

# The code graph is per checkout and never committed.
if command -v codegraph >/dev/null 2>&1 && [ ! -d .codegraph ]; then
  codegraph init . >/dev/null
fi

echo "worktree ready: $(pwd) on $(git branch --show-current)"
