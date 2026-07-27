---
name: how-to-chrome
description: "Use Google Chrome from the terminal via the Chrome DevTools Protocol (CDP), no extension and no npm dependencies. Navigate, capture (incl. full page and per breakpoint), read console/DOM, fill forms and do QA; export the design to PDF (to-pdf.mjs); annotate page elements to paste into an AI (annotate.mjs); and group tabs into a dedicated Chrome tab group (group.mjs). Use whenever you need to open/test/audit a website in the browser, verify a design, debug with the console, export screenshots/PDF, annotate changes, or manage tabs."
---

# How to Chrome: control Chrome from the terminal (CDP)

Control **Google Chrome** from the terminal with the **Chrome DevTools Protocol
(CDP)**. No `claude-in-chrome` extension, no MCP, no npm packages: Node 21+
ships native `WebSocket` and `fetch`, so the tools are single-file scripts in
`scripts/`.

## How it works (architecture)

```
terminal (Node)  --WebSocket-->  Chrome (--remote-debugging-port=9222)
   send(method, params) ------->   Page.navigate, Page.captureScreenshot,
   <--- result / events            Runtime.evaluate, Emulation.setDeviceMetricsOverride,
                                    Extensions.loadUnpacked, Target.*, ...
```

1. Chrome is started **once** with `--remote-debugging-port=9222` (the port
   only activates at startup; you cannot "plug into" a Chrome that is already open).
2. `http://127.0.0.1:9222/json` lists tabs (targets) with their
   `webSocketDebuggerUrl`; `/json/version` gives the browser-level WS endpoint.
3. The script connects over WebSocket and sends CDP commands; events come back
   over the same socket.

## Requirements and dependencies

- **Google Chrome** (v111+; see version notes in `references/persistent-setup.md`).
- **Node.js 21+** (`node --version`), ships native `fetch`/`WebSocket`, zero `npm install`.
- If the agent runs on **WSL2 and Chrome runs on Windows**: `pwsh.exe` or
  `powershell.exe` reachable from WSL, and WSL2's `mirrored` networking mode
  (see `references/wsl2-networking.md`, **read it first** if this applies, it
  is the most common reason nothing connects).

No other dependency: no MCP needed, no need for the official `claude-in-chrome`
extension (do not run both against the same Chrome).

## Installation

1. This folder is already self-contained. Copy it as-is into
   `.claude/skills/how-to-chrome/` in your project, or install it as a plugin
   (see the repo README).
2. Start Chrome with the debug port:

   ```bash
   pwsh -File scripts/launch-chrome.ps1          # dedicated profile (your logins)
   pwsh -File scripts/launch-chrome.ps1 -CleanProfile   # isolated profile (anonymous tests)
   ```

   From a **WSL** terminal, use the wrapper (it also checks that the port is
   reachable from Linux, which is where the scripts run):

   ```bash
   scripts/launch-chrome.sh          # dedicated profile
   scripts/launch-chrome.sh --clean  # isolated profile
   ```
3. Verify: `curl http://127.0.0.1:9222/json/version`.

> **Why a dedicated profile instead of your usual one:** since Chrome 136 the
> browser **ignores `--remote-debugging-port` if the profile is the DEFAULT
> one**. The launcher already uses a dedicated profile (`CDP-Profile`), a new
> and separate folder that **never touches, reads, or deletes your real
> profile** (cookies, sessions, passwords, and history from your everyday
> Chrome stay untouched). If you want Chrome to **always** start with the port
> open (without relaunching it every session), see the persistent setup in
> `references/persistent-setup.md`, it includes an option that does not touch
> a single one of your existing shortcuts.

## 1) `scripts/cdp.mjs`: browser control

```bash
node scripts/cdp.mjs <command> [args]
```

| Command | What it does |
|--------|----------|
| `tabs` | Lists tabs with their `tabId` and URL (from ALL windows, without distinguishing them) |
| `windows` | Lists the browser's **windows**, with their tabs, size, position, and state |
| `nav <url> [tabId]` | Navigates (creates a new tab if you do not pass `tabId`) |
| `shot <a.png> [--full] [--w N --h N] [--mobile] [tabId]` | Captures. `--full` = full page; `--w/--h` = viewport; `--mobile` = touch+DPR |
| `responsive <url> <dir>` | Full-page captures on mobile/tablet/laptop/desktop |
| `text` / `html [tabId]` | Visible text / full HTML |
| `eval "<js>" [tabId]` | Runs JS and returns the result (supports promises) |
| `click "<sel>"` / `type "<sel>" "<txt>" [tabId]` | Click / fill input (fires input+change) |
| `console [tabId]` | Dumps console, logs, and exceptions for 3s |

`tabId` is the `id` shown by `tabs`. Without `tabId`, it uses the first tab.

**Typical flows:**
- *Dev loop:* `nav localhost:4321` -> `shot dev.png --full` -> `console` -> fix -> repeat.
- *Responsive QA:* `responsive http://localhost:4321 qa/home`, then review overflow, breakpoints, tap targets...
- *Functional QA:* `nav /contact` -> `type "#email" "bad"` -> `click "button[type=submit]"` -> `shot`.
- *DOM debugging:* `eval "getComputedStyle(document.querySelector('.hero')).padding"`.

## 2) `scripts/to-pdf.mjs`: export to PDF

Captures the full page at the requested viewport and embeds it in a
single-page PDF (pixel-accurate; it does not reflow like `printToPDF`).

```bash
node scripts/to-pdf.mjs <url> <output.pdf> --w 1440           # desktop
node scripts/to-pdf.mjs <url> <output.pdf> --w 390 --mobile   # mobile
```

## 3) `scripts/annotate.mjs`: annotate elements for AI

Injects a panel into the page (via CDP): you select elements, write a
comment, and it writes a `.md` (CSS selector, HTML, styles, and a
**screenshot of the element**) ready to paste into any AI. It also copies to
the clipboard.

```bash
node scripts/annotate.mjs [url] --out annotations.md
# keeps the process alive: every "Add annotation" writes to the .md file. Ctrl+C to stop.
```
In the browser: **Select element** -> click an element -> **Up (parent) /
Down (child)** (or arrow keys) to navigate the hierarchy at that point
(useful for parents covered by their children) -> comment -> **Add
annotation**. The yellow box stays put while scrolling.

## 4) `scripts/group.mjs`: dedicated tab groups

CDP has no tab groups command, but **`Extensions.loadUnpacked`** lets you
load a minimal extension **on the fly** (without relaunching Chrome).
`group.mjs` loads it and runs `chrome.tabs.group` in its service worker,
putting tabs into a "Claude" group so they do not get mixed with yours.

```bash
node scripts/group.mjs open <url> [url2 ...]   # opens tabs in the "Claude" group
node scripts/group.mjs status                  # lists groups and tabs
```
The extension lives in `scripts/ext-group/` (only `tabs` + `tabGroups` permissions).

## Technical notes (read before touching capture logic)

- **Full-page capture width:** use the **emulated viewport**, NOT
  `cssContentSize.width`. Content clipped horizontally (a marquee with
  `overflow-x:clip`) inflates `cssContentSize` and adds an empty strip on the right.
- **Texture limit (~16384px):** a very tall page at DPR>1 gets **duplicated**
  (Chrome does not fail, it repeats content). Full-page captures use **DPR 1**
  and, if they still exceed the limit, get scaled down with `clip.scale`.
- **Lazy-load on full-page:** a screenshot does not trigger `loading="lazy"`
  outside the viewport, so images come out blank. Before capturing: force
  `eager` + a scroll sweep + wait for them to load (bounded; **never
  `img.decode()`**, it can hang).
- **Highlight that survives scrolling:** `position:absolute` with page
  coordinates (`rect + scrollX/scrollY`), not `fixed` with viewport coordinates.
- **`elementsFromPoint`** only sees the viewport: to select an element it must
  be on screen.
- **Emulation:** `setDeviceMetricsOverride` works; `Page.printToPDF` ignores
  it (it uses its own `paperWidth`), which is why `to-pdf` captures via
  screenshot instead of `printToPDF`.
- **Never ask the OS for the browser's state; ask the browser.** Counting
  windows via OS processes is misleading (see `references/troubleshooting.md`);
  the right way is to group CDP targets by the `windowId` returned by
  `Browser.getWindowForTarget`, which is exactly what `cdp.mjs windows` does.

More gotchas and lessons learned from real use: `references/troubleshooting.md`.

## Security

- With `--remote-debugging-port` active, any local process can control that
  Chrome instance. Only use it while you are working; the port disappears
  when you close Chrome (unless you applied the persistent setup).
- With your real profile, screenshots/DOM may include data from logged-in
  sessions: review before sharing.
- This is direct CDP control, not the official `claude-in-chrome` extension
  (do not run both against the same Chrome).

## Quick troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| `ECONNREFUSED 127.0.0.1:9222` | Chrome without the flag, use `scripts/launch-chrome.ps1`, or open it via an already configured shortcut |
| Chrome starts but 9222 does not respond (not even from Windows) | DEFAULT profile: Chrome 136+ ignores `--remote-debugging-port` there. Use the dedicated profile, see `references/persistent-setup.md` |
| `ECONNREFUSED` from WSL while Chrome DID start | WSL in NAT mode: the loopback is not shared, see `references/wsl2-networking.md` |
| `nav` does not switch to the tab I want | Without `tabId` it creates a new one; pass the `tabId` from `tabs` |
| Port already in use (`EADDRINUSE`) | Another Chrome is using 9222; close it and relaunch, or use a different `-Port` |
| Capture wider than expected | Known full-page width bug, already worked around by forcing the emulated viewport in `cdp.mjs` |
| Blank images in the capture | Lazy-load; `cdp.mjs` already does the scroll preload |
| `group.mjs` cannot find the service worker | The extension took a moment to register; retry (the script already waits) |
| Login/CAPTCHA blocks progress | Solve it by hand in the visible window and resume |

Expanded table, with root causes and real historical cases:
`references/troubleshooting.md`.
