# Extended troubleshooting and lessons learned

Quick symptom table lives in the main `SKILL.md`. Here is the root-cause
detail and the real-world findings that do not fit in the quick reference.

## `Extensions.loadUnpacked` fails with "File path cannot be resolved."

Happens when `grupo.mjs` runs on **WSL** but Chrome is the **Windows**
binary: if you give it the Linux path for `scripts/ext-grupos/`
(`/mnt/c/...` or similar), Chrome cannot resolve it, it needs a Windows path
(`C:\...`).

**Fix already applied in the script:** `grupo.mjs` translates the path with
`wslpath -w` before passing it to `Extensions.loadUnpacked` (function
`pathForChrome()`). Outside WSL, `wslpath` does not exist and the script uses
the path as-is.

## Counting windows/tabs via the operating system lies to you

Counting `chrome.exe` processes with `Get-Process | Where MainWindowTitle`
(or the equivalent) always gives **1** even when several windows are open:
all windows of the same profile hang off the **same root process** (the
other processes are tab, extension, and GPU renderers, with no window of
their own), and `MainWindowTitle` returns only one per process, whichever is
in the foreground. That title also *changes* between queries, giving the
false impression that the user navigated.

**The reliable source is the browser itself:** group CDP targets by the
`windowId` returned by `Browser.getWindowForTarget`, which is exactly what
`cdp.mjs windows` does. The same applies to knowing whether tabs are open,
what is currently visible, or which monitor a window is on: the truth lives
in CDP, not in the OS process list.

## `shot`/`eval`/`text` without `tabId` go to the first tab

An easy mistake: navigating with `nav <url>` (without `tabId`, it creates a
new tab) and then capturing with `shot` without passing that new tab's
`tabId`, it captures the **first** tab in the list, not the one you just
opened. Always pass the `tabId` returned by `tabs` when working with more
than one tab.

## Full-page captures with `position: sticky` look like layout bugs that are not real

When running `shot --full` on a page with a `position: sticky` nav/header, a
visual "overlap" can show up in the capture that **looks** like a real
layout bug but is actually a **stitching artifact** of the full-page capture
(the sticky element repeats itself at the seam between the captured viewport
and the rest of the scroll). Before reporting a visual overlap bug, capture
again at a real viewport (without `--full`) to confirm whether it is a real
issue or just a capture artifact.

## Scroll "reveal" animations do not show up in full-page captures

Beyond the `loading="lazy"` case already covered by `cdp.mjs`'s preload step,
`IntersectionObserver`-based animations (typical pattern: `opacity:0` + a
class added on entering the viewport) also fail to fire during a full-page
capture if the element never enters the real viewport during the preload
sweep, they come out blank even though they work fine with real user
scrolling. If a section renders empty in the capture but looks fine in the
browser, suspect this before a CSS bug.

## Minimum verified version

Confirmed working with Chrome 136+ (dedicated profile) and Chrome 150 on
Windows 11 (build 26200+), WSL2 2.6+, with `networkingMode=mirrored`. Chrome
versions before 111 do not have the `--remote-debugging-address` problem
(but they do not need it either: they expose the port more loosely).
