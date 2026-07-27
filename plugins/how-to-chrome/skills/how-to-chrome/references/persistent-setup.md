# Persistent setup: Chrome always with the CDP port

> **Starting guarantee:** everything in this document lives in a **new,
> separate** profile folder (`CDP-Profile`). At no point is
> `%LOCALAPPDATA%\Google\Chrome\User Data` (your real Chrome profile) read,
> modified, or deleted. Your cookies, saved passwords, history, extensions,
> and logged-in session **are not touched**. The only thing that can change
> is **what your Chrome icon opens**, if you pick the "always" option below.
> Read the warning before applying it.

To avoid relaunching Chrome every session, you can leave Chrome configured to
start with the debug port without having to launch it by hand each time.

## The obstacle: the Chrome 136+ mitigation

Since Chrome 136 the browser **ignores `--remote-debugging-port` if the
profile is the DEFAULT one** (`...\User Data`, your real account). It is a
security mitigation, not avoidable via flags, pointing `--user-data-dir` at
the default folder does not work either. The only way around it is a
**dedicated profile**: a different profile folder, empty at first, that
Chrome treats as a separate browser account.

Confirmed empirically with an A/B test: same Chrome, same flags, the only
difference being `user-data-dir`, with the default profile the port is not
exposed; with a dedicated profile it is.

Precisely because it is a separate folder, creating and using this dedicated
profile **requires no touching of your real profile whatsoever**: it is not
read, not copied, not deleted. The dedicated profile starts empty (no
cookies or logins of yours) and only recovers what **Chrome Sync**
synchronizes if you sign in on it, it is a new profile, not a copy of yours.

## Recommended option: a NEW, dedicated shortcut (zero impact on your everyday Chrome)

The way to have the CDP port available without touching your daily browsing
at all: create **a single new shortcut** ("Chrome (CDP)") that opens the
dedicated profile, leaving **all your current shortcuts untouched**, your
everyday Chrome icon keeps opening your real profile, with your cookies,
sessions, and passwords exactly as they are today. You only use the new
shortcut when you want an agent to control Chrome.

```powershell
$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$udd  = "$env:LOCALAPPDATA\Google\Chrome\CDP-Profile"
$dest = "$env:USERPROFILE\Desktop\Chrome (CDP).lnk"

$ws  = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($dest)
$lnk.TargetPath   = $chrome
$lnk.Arguments    = "--remote-debugging-port=9222 --user-data-dir=`"$udd`""
$lnk.IconLocation = "$chrome,0"
$lnk.Save()
```

This **does not modify any existing shortcut** or any file in your real
profile, it only creates a new `.lnk` on the desktop. Verify (opening Chrome
from that new icon): `curl http://127.0.0.1:9222/json/version` should return
the `Browser` info.

`scripts/launch-chrome.ps1` does the same thing from the command line
(launches the dedicated profile without creating any shortcut), so in
practice this step is often not even needed.

## Alternative (more aggressive): make Chrome ALWAYS start with CDP, however it is opened

There is a more convenient but more invasive option: rewriting **all** of
your Chrome shortcuts (desktop, taskbar, Quick Launch) so they carry the port
and dedicated-profile flags, so you never have to remember to use a special
icon.

> WARNING, **what actually changes:** once you apply this, double-clicking
> your regular, long-standing Chrome icon opens the **dedicated profile**
> (empty at first), not your real one. Your real profile (`User Data`) stays
> intact on disk, nothing gets deleted, but **you stop seeing it** through
> those shortcuts until you open it explicitly (see "Getting back to your
> real profile" below) or restore sessions via Chrome Sync. Keep in mind Sync
> **does not sync everything**: cookies from sites where you did not check
> "stay signed in", local data from some extensions, or passwords if you
> excluded that data type from sync, do not come back on their own. Use this
> option only if you want the dedicated profile to become your working
> browser from now on; if you just want CDP available without giving up any
> of your everyday browsing, use the recommended option above.

If you still want it:

```powershell
$udd   = "$env:LOCALAPPDATA\Google\Chrome\CDP-Profile"
$flags = "--remote-debugging-port=9222 --user-data-dir=`"$udd`""
$ws = New-Object -ComObject WScript.Shell
foreach($d in @("$env:USERPROFILE\Desktop","$env:PUBLIC\Desktop",
  "$env:APPDATA\Microsoft\Windows\Start Menu\Programs",
  "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar",
  "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch")){
  if(Test-Path $d){ Get-ChildItem $d -Filter *.lnk -Recurse -EA SilentlyContinue | %{
    $l=$ws.CreateShortcut($_.FullName); if($l.TargetPath -like "*chrome.exe"){ $l.Arguments=$flags; $l.Save() } } }
}
```

Repeatable, useful if a Chrome update regenerates the shortcuts and they lose
the flags. **Verify** (Chrome opened from any shortcut):
`curl http://127.0.0.1:9222/json/version` should return the `Browser` info.

### Getting back to your real profile without undoing anything

Your real profile never moved or got deleted, it is still at
`%LOCALAPPDATA%\Google\Chrome\User Data`. To open it explicitly even if your
shortcuts already point at the dedicated profile:

```powershell
& "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" `
  --user-data-dir="$env:LOCALAPPDATA\Google\Chrome\User Data" --profile-directory=Default
```

(without `--remote-debugging-port`: this is your normal Chrome, no CDP). To
fully revert the shortcuts, run the rewrite script above again but with
`$flags = ""` (leave `$l.Arguments` empty) instead of the CDP flags.

### Reconfiguring the shortcuts

Repeat the same block from the aggressive alternative above as many times as
needed, it is idempotent.

**Verify** (Chrome opened from any shortcut):
`curl http://127.0.0.1:9222/json/version` should return the `Browser` info.

## Limitations

- This covers opening Chrome via a **shortcut**. Links opened from OTHER apps
  (email, etc.) use the registry handler and do **not** carry the flag,
  covering those would require touching
  `HKCU\...\ChromeHTML\shell\open\command` (more intrusive, not covered here).
- The **system Start menu** (`C:\ProgramData\...\Start Menu`) requires admin
  rights and may not be modifiable.
- If Chrome is already open, a new launch does NOT reapply flags: close it
  completely (`taskkill /IM chrome.exe /F`) and reopen it.
  `scripts/launch-chrome.ps1` already does this for you. `taskkill` closes
  tabs without saving in-progress changes (half-filled forms, etc.), but it
  does not delete cookies, history, or saved sessions, those live on disk,
  not in the process.

## Security

WARNING, with the debug port **always** open, any local process can control
Chrome. It is a deliberate trade-off for convenience, do not enable it on a
shared or exposed machine. To revert: remove
`--remote-debugging-port=9222 --user-data-dir=...` from the shortcuts (or
just delete the new shortcut if you used the recommended option).
