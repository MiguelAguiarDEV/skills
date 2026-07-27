# launch-chrome.ps1 — arranca Chrome con el puerto CDP sobre un perfil DEDICADO (CDP-Profile).
# Cierra cualquier Chrome abierto (necesario: el perfil solo lo usa una instancia) y relanza
# con --remote-debugging-port.
#
# IMPORTANTE: Chrome 136+ IGNORA --remote-debugging-port cuando el user-data-dir es el
# POR DEFECTO (mitigación de seguridad, no evitable). Por eso se usa un perfil propio
# (CDP-Profile), que sí expone el puerto y persiste logins/extensiones/marcadores
# (con Chrome Sync se recuperan al iniciar sesión la primera vez).
#
# Uso:  pwsh -File launch-chrome.ps1 [-Port 9222] [-CleanProfile]
#   -CleanProfile  usa un perfil temporal aislado (sin logins) en vez del real.

param(
  [int]$Port = 9222,
  [switch]$CleanProfile
)

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { Write-Error "Chrome no encontrado"; exit 1 }

if ($CleanProfile) {
  $udd = Join-Path $env:TEMP "cdp-chrome-profile"
} else {
  # Perfil DEDICADO (no el default) — es la única forma de exponer el puerto en Chrome 136+.
  $udd = "$env:LOCALAPPDATA\Google\Chrome\CDP-Profile"
  # Relanzar limpio requiere cerrar cualquier Chrome abierto (una instancia por perfil).
  Get-Process chrome -ErrorAction SilentlyContinue | ForEach-Object { $_.CloseMainWindow() | Out-Null }
  Start-Sleep -Milliseconds 800
  taskkill /IM chrome.exe /F 2>$null | Out-Null
  Start-Sleep -Milliseconds 500
}

$chromeArgs = @(
  "--remote-debugging-port=$Port",
  "--user-data-dir=$udd",
  "--profile-directory=Default",
  "--restore-last-session",
  "about:blank"
)
Start-Process $chrome -ArgumentList $chromeArgs
Write-Output "Chrome lanzado con CDP en 127.0.0.1:$Port (perfil: $(if($CleanProfile){'aislado'}else{'REAL'}))"

# Espera a que el endpoint responda.
for ($i = 0; $i -lt 30; $i++) {
  try {
    $v = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 1 -ErrorAction Stop
    Write-Output "CDP LISTO -> $($v.Browser)"
    exit 0
  } catch { Start-Sleep -Milliseconds 500 }
}
Write-Error "El endpoint CDP no respondio en 15s"
exit 1
