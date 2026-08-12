# launch-chrome.ps1: starts Chrome with the CDP port on a DEDICATED profile (CDP-Profile).
# Closes any open Chrome (necessary: the profile can only be used by one instance) and relaunches
# it with --remote-debugging-port.
#
# IMPORTANT: Chrome 136+ IGNORES --remote-debugging-port when the user-data-dir is the
# DEFAULT one (security mitigation, not avoidable). That is why a dedicated profile is
# used (CDP-Profile), which does expose the port and persists logins/extensions/bookmarks
# (with Chrome Sync they get restored the first time you sign in).
#
# Usage:  pwsh -File launch-chrome.ps1 [-Port 9222] [-CleanProfile]
#   -CleanProfile  uses an isolated temporary profile (no logins) instead of the real one.

param(
  [int]$Port = 9222,
  [switch]$CleanProfile
)

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { Write-Error "Chrome not found"; exit 1 }

if ($CleanProfile) {
  $udd = Join-Path $env:TEMP "cdp-chrome-profile"
} else {
  # DEDICATED profile (not the default one): the only way to expose the port on Chrome 136+.
  $udd = "$env:LOCALAPPDATA\Google\Chrome\CDP-Profile"
  # A clean relaunch requires closing any open Chrome (one instance per profile).
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
Write-Output "Chrome launched with CDP on 127.0.0.1:$Port (profile: $(if($CleanProfile){'isolated'}else{'REAL'}))"

# Wait for the endpoint to respond.
for ($i = 0; $i -lt 30; $i++) {
  try {
    $v = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 1 -ErrorAction Stop
    Write-Output "CDP READY -> $($v.Browser)"
    exit 0
  } catch { Start-Sleep -Milliseconds 500 }
}
Write-Error "The CDP endpoint did not respond within 15s"
exit 1
