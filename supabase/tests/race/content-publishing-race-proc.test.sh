#!/usr/bin/env bash
# Process-control regression for content-publishing-race.sh: cleanup must only
# signal its own still-running children, never a PID that was already reaped
# (the OS may have given that number to an unrelated process). A stubbed kill
# records every call and pretends reaped PIDs are alive, as a reused PID would
# be; it forwards real signals only to this test's own running sleeper.
# Needs no database.
set -euo pipefail

SCRIPT="${1:-$(dirname "$0")/content-publishing-race.sh}"
eval "$(sed -n '/^# >>> process control/,/^# <<< process control/p' "$SCRIPT")"

LOG=$(mktemp); trap 'rm -f "$LOG"' EXIT
OWNED=""
REUSED=""   # completed children whose numbers the stub treats as taken by someone else
kill() { # stub: records calls; -0 says "alive" for reused numbers; forwards only to the live sleeper
  local sig=$1 pid=$2
  echo "$sig $pid" >>"$LOG"
  case " $REUSED " in *" $pid "*) [ "$sig" = -0 ] && return 0; return 0 ;; esac
  [ "$pid" = "${LIVE:-}" ] && { command kill "$sig" "$pid"; return; }
  return 1
}
fails=0
check() { if eval "$2"; then echo "ok - $1"; else echo "not ok - $1"; fails=$((fails + 1)); fi; }
owned() { case " $OWNED " in *" $1 "*) return 0 ;; esac; return 1; }

# A child that exits 0 and one that exits 3 are reaped by wait_child.
sleep 0.1 & done0=$!; OWNED="$OWNED $done0"
sh -c 'exit 3' & done3=$!; OWNED="$OWNED $done3"
s0=0; wait_child "$done0" 5 || s0=$?
s3=0; wait_child "$done3" 5 || s3=$?
check "wait_child returns each child's status (0 and 3)" '[ "$s0" -eq 0 ] && [ "$s3" -eq 3 ]'
check "a reaped child leaves OWNED, whatever its status" '! owned "$done0" && ! owned "$done3"'

# A child bash reaps on its own before any explicit wait.
sleep 0.1 & early=$!; OWNED="$OWNED $early"
sleep 0.5
REUSED="$done0 $done3 $early"
started=$(date +%s)
se=0; wait_child "$early" 3 || se=$?
check "a child bash already reaped is not mistaken for a running one" '[ "$se" -eq 0 ] && [ $(( $(date +%s) - started )) -lt 2 ]'

# Cleanup with all three numbers now "reused", plus one live sleeper of our own.
sleep 30 & LIVE=$!; OWNED="$OWNED $LIVE"
: >"$LOG"
stop_children
check "cleanup sends no signal to a reaped, reused PID" '! grep -Eq -- "-(TERM|KILL) ($done0|$done3|$early)$" "$LOG"'
check "cleanup still stops its own running child" 'grep -q -- "-TERM $LIVE$" "$LOG" && ! command kill -0 "$LIVE" 2>/dev/null'
check "OWNED is empty after cleanup" '[ -z "$(echo $OWNED)" ]'

[ "$fails" -eq 0 ]
