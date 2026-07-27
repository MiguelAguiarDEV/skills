#!/usr/bin/env bash
# launch-chrome.sh — arranca el Chrome de WINDOWS con el puerto CDP y verifica
# que se alcanza DESDE WSL. Envoltorio de launch-chrome.ps1 para no salir del
# terminal Linux.
#
# Uso:  ./launch-chrome.sh [--clean] [--port N]
#   --clean   perfil temporal aislado (sin tus logins) en vez del perfil real
#
# Requiere WSL en modo espejo (networkingMode=mirrored en C:\Users\<tu>\.wslconfig).
# Sin modo espejo, el 127.0.0.1 de Linux NO es el de Windows y esto no conecta.
set -uo pipefail

PORT=9222
PS_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --clean) PS_ARGS+=("-CleanProfile") ;;
    --port)  PORT="$2"; shift ;;
    *) echo "Opción desconocida: $1" >&2; exit 2 ;;
  esac
  shift
done
PS_ARGS+=("-Port" "$PORT")

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PS1_WIN="$(wslpath -w "$AQUI/launch-chrome.ps1")"
PS_EXE="$(command -v pwsh.exe || command -v powershell.exe)"
[ -n "$PS_EXE" ] || { echo "No encuentro pwsh.exe ni powershell.exe" >&2; exit 1; }

echo "Lanzando Chrome en Windows (puerto $PORT)…"
"$PS_EXE" -NoProfile -File "$PS1_WIN" "${PS_ARGS[@]}" | tr -d '\r'

# El .ps1 ya comprueba el endpoint desde Windows; lo que importa aquí es que se
# vea desde Linux, que es donde corren las herramientas de browser/.
echo -n "Comprobando acceso desde WSL a 127.0.0.1:$PORT … "
for _ in $(seq 1 20); do
  if VER=$(curl -s --max-time 1 "http://127.0.0.1:$PORT/json/version" 2>/dev/null) && [ -n "$VER" ]; then
    echo "OK"
    echo "$VER" | (command -v jq >/dev/null && jq -r '"  " + .Browser + "\n  " + .webSocketDebuggerUrl' || cat)
    exit 0
  fi
  sleep 0.5
done

echo "FALLO"
cat >&2 <<'EOF'

Chrome arrancó en Windows pero WSL no llega a su 127.0.0.1. Casi siempre es que
el modo espejo no está activo. Comprobar:

  1. Que existe C:\Users\<tu>\.wslconfig con:
         [wsl2]
         networkingMode=mirrored
  2. Que se aplicó: hace falta 'wsl --shutdown' desde PowerShell y reabrir WSL.
  3. Verificar el modo:  ip route | grep default
     - Sin salida (o gateway = tu router) -> modo espejo activo.
     - Gateway tipo 172.x.x.1 -> sigues en NAT, el shutdown no se hizo.
EOF
exit 1
