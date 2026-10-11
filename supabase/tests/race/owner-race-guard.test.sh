#!/usr/bin/env bash
# owner-race.sh commits synthetic rows, so outside CI it must refuse the shared
# local stack (:54322) and refuse to run without an explicit DB_URL. A fake
# psql first on PATH records any call, so this test never reaches a database.
set -euo pipefail

SCRIPT="${1:-$(dirname "$0")/owner-race.sh}"
BIN=$(mktemp -d); LOG="$BIN/calls"; trap 'rm -rf "$BIN"' EXIT
printf '#!/bin/sh\necho "$@" >> "%s"\nexit 1\n' "$LOG" > "$BIN/psql"; chmod +x "$BIN/psql"
fails=0
check() { if eval "$2"; then echo "ok - $1"; else echo "not ok - $1"; fails=$((fails + 1)); fi; }
run() { # $1 env assignments; prints the exit code
  : > "$LOG"; local code=0
  env -u CI -u DB_URL PATH="$BIN:$PATH" $1 bash "$SCRIPT" >/dev/null 2>&1 || code=$?
  echo "$code"
}

code=$(run "")
check "without DB_URL outside CI it exits 2 and never calls psql" '[ "$code" = 2 ] && [ ! -s "$LOG" ]'
code=$(run "DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres")
check "an explicit :54322 outside CI exits 2 and never calls psql" '[ "$code" = 2 ] && [ ! -s "$LOG" ]'
code=$(run "DB_URL=postgresql://postgres:postgres@localhost:54322/postgres")
check "localhost:54322 is refused too" '[ "$code" = 2 ] && [ ! -s "$LOG" ]'
code=$(run "DB_URL=postgresql://postgres:postgres@127.0.0.1:55434/postgres")
check "an isolated DB_URL is allowed to reach psql" '[ -s "$LOG" ]'
code=$(run "CI=true")
check "in CI the default stack is allowed to reach psql" '[ -s "$LOG" ]'

[ "$fails" -eq 0 ]
