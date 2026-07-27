#!/usr/bin/env bash
# launch-chrome.sh: starts WINDOWS' Chrome with the CDP port and verifies
# that it is reachable FROM WSL. Wrapper around launch-chrome.ps1 so you
# never have to leave the Linux terminal.
#
# Usage:  ./launch-chrome.sh [--clean] [--port N]
#   --clean   isolated temporary profile (no logins) instead of the real one
#
# Requires WSL in mirrored mode (networkingMode=mirrored in C:\Users\<you>\.wslconfig).
# Without mirrored mode, Linux's 127.0.0.1 is NOT Windows' and this will not connect.
set -uo pipefail

PORT=9222
PS_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --clean) PS_ARGS+=("-CleanProfile") ;;
    --port)  PORT="$2"; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
PS_ARGS+=("-Port" "$PORT")

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PS1_WIN="$(wslpath -w "$HERE/launch-chrome.ps1")"
PS_EXE="$(command -v pwsh.exe || command -v powershell.exe)"
[ -n "$PS_EXE" ] || { echo "Cannot find pwsh.exe or powershell.exe" >&2; exit 1; }

echo "Launching Chrome on Windows (port $PORT)..."
"$PS_EXE" -NoProfile -File "$PS1_WIN" "${PS_ARGS[@]}" | tr -d '\r'

# The .ps1 already checks the endpoint from Windows; what matters here is
# that it is reachable from Linux, which is where the browser/ tools run.
echo -n "Checking access from WSL to 127.0.0.1:$PORT ... "
for _ in $(seq 1 20); do
  if VER=$(curl -s --max-time 1 "http://127.0.0.1:$PORT/json/version" 2>/dev/null) && [ -n "$VER" ]; then
    echo "OK"
    echo "$VER" | (command -v jq >/dev/null && jq -r '"  " + .Browser + "\n  " + .webSocketDebuggerUrl' || cat)
    exit 0
  fi
  sleep 0.5
done

echo "FAILED"
cat >&2 <<'EOF'

Chrome started on Windows but WSL cannot reach its 127.0.0.1. This almost
always means mirrored mode is not active. Check:

  1. That C:\Users\<you>\.wslconfig exists with:
         [wsl2]
         networkingMode=mirrored
  2. That it was applied: you need to run 'wsl --shutdown' from PowerShell and reopen WSL.
  3. Check the mode:  ip route | grep default
     - No output (or gateway = your router) -> mirrored mode is active.
     - Gateway like 172.x.x.1 -> you are still in NAT, the shutdown was not done.
EOF
exit 1
