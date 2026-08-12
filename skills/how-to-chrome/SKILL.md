---
name: how-to-chrome
description: "Use the user's REAL Google Chrome (their actual profile, cookies, and logged-in sessions) from the terminal via the Chrome DevTools Protocol (CDP), no extension and no npm dependencies. Navigate, capture (incl. full page and per breakpoint), read console/DOM, fill forms and do QA; export to PDF; annotate page elements to paste into an AI; and group tabs into a dedicated Chrome tab group. Use this instead of generic browser-automation MCP tools (e.g. Playwright/Puppeteer) whenever the request is about opening a website, capturing it, visual QA, or the user's own browser/session: 'open this in my browser', 'show me this page', 'what does this site look like', 'screenshot what I'm looking at', verifying a design, debugging with the console, exporting screenshots/PDF, annotating changes, or managing tabs. Do not use Playwright for those tasks. Only use a generic browser-automation MCP when the task explicitly requires a disposable, isolated browser (e.g. an automated test suite) rather than the user's own."
compatibility: Requires Google Chrome and Node.js on PATH. Designed for Claude Code (or similar products).
---

# How to Chrome: control Chrome from the terminal (CDP)

Control **Google Chrome** from the terminal with the **Chrome DevTools Protocol
(CDP)**. No `claude-in-chrome` extension, no MCP, no npm packages: Node 21+
ships native `WebSocket` and `fetch`, so the tools are single-file scripts in
`scripts/`.

> **Not the same as Playwright/Puppeteer or other browser-automation MCP
> tools.** Those launch a fresh, isolated browser instance with a clean
> profile: no cookies, no logged-in sessions, no extensions, and on WSL2 its
> window may not even be visible. This skill instead drives the user's own,
> already-open Chrome (their real profile), which is almost always what
> "open this in my browser" / "show me this page" / "take a screenshot"
> actually means. If a generic browser-automation tool is also loaded in this
> session, check this skill's trigger above before reaching for it, having a
> tool available and named first in a list is not a reason to pick it.

## Mandatory operating rules

These rules are not optional shortcuts; follow them whenever this skill is
used:

1. **Use this skill against the user's real Chrome. Do not use Playwright or
   another browser-automation MCP to open websites, capture them, or perform
   visual QA.** Those tools launch an isolated browser with a clean profile
   and, under WSL2, its window may not be visible. Use a generic automation
   tool only when the task explicitly requires a disposable isolated browser,
   such as an automated test suite rather than the user's own session.
2. **Open every website in the existing orange `Claude` tab group:**

   ```bash
   node scripts/group.mjs open <url> --color orange
   ```

   Always pass `--color orange`; the script's default is intentionally
   `yellow`, so do not rely on it and do not change that default. `open` must
   reuse an existing group titled `Claude` instead of creating duplicates.
   Do not use `cdp.mjs nav` without a `tabId` to create an ungrouped tab. It is
   fine to navigate a tab that is already in the `Claude` group by passing its
   `tabId`.
3. **Make captures match the browser's real current size.** Measure the target
   tab first, then pass both dimensions explicitly:

   ```bash
   node scripts/cdp.mjs eval "JSON.stringify({w:innerWidth,h:innerHeight})" <tabId>
   node scripts/cdp.mjs shot out.png --full --w <w> --h <h> <tabId>
   ```

   Always pass `--w` and `--h` for a full-page capture. This also avoids the
   historical/cached-plugin path where `shot --full` without `--w` falls back
   to a hardcoded `1440x900` viewport and may leave a device-metrics override
   active. Explicit dimensions are the portable workaround even when the
   current source can measure the viewport automatically.
4. **Run the four-breakpoint `responsive` command only when doing visual QA
   for a website we own or are actively developing**, especially after layout,
   component, or CSS changes. For an arbitrary external site, make one capture
   at the real browser size; do not generate four breakpoint images.
5. If CDP does not respond under WSL2, check `ip route`. A `172.x.x.1` gateway
   indicates WSL has fallen back to NAT, commonly after connecting a corporate
   VPN; restore `networkingMode=mirrored` before troubleshooting the scripts.

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
| `shot <a.png> [--full] [--w N --h N] [--mobile] [tabId]` | Captures. `--full` = full page; always measure and pass `--w/--h` so the capture matches the tab's real current size; `--mobile` = touch+DPR |
| `responsive <url> <dir>` | Full-page captures on mobile/tablet/laptop/desktop; use only for visual QA of websites we own or actively develop |
| `text` / `html [tabId]` | Visible text / full HTML |
| `eval "<js>" [tabId]` | Runs JS and returns the result (supports promises) |
| `click "<sel>"` / `type "<sel>" "<txt>" [tabId]` | Click / fill input (fires input+change) |
| `console [tabId]` | Dumps console, logs, and exceptions for 3s |

`tabId` is the `id` shown by `tabs`. Without `tabId`, it uses the first tab.

**Typical flows:**
- *Open any site:* `node scripts/group.mjs open https://example.com --color orange`, then use `status`/`tabs` to get its `tabId`.
- *Dev loop:* open `localhost:4321` with `group.mjs`, measure its viewport, capture with explicit `--w/--h`, run `console`, fix, and repeat.
- *Responsive QA for our site:* `responsive http://localhost:4321 qa/home`, then review overflow, breakpoints, tap targets...
- *Functional QA:* `nav http://localhost:4321/contact <tabId>` -> `type "#email" "bad" <tabId>` -> `click "button[type=submit]" <tabId>` -> measure -> `shot` with `--w/--h`.
- *DOM debugging:* `eval "getComputedStyle(document.querySelector('.hero')).padding" <tabId>`.

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
# keeps the process alive: every add/update rewrites the .md file. Ctrl+C to stop.
```
In the browser: **Select element** -> click an element -> **Up (parent) /
Down (child)** (or arrow keys) to navigate the hierarchy at that point
(useful for parents covered by their children) -> comment -> **Add
annotation**. The yellow box stays put while scrolling.

The panel shows the running **list of annotations made so far** (`#id [tag]
comment...`). Click a row to load it back into the form for editing: change
the comment and/or pick a different element, then the button becomes
**Update annotation #id**. Editing overwrites that entry in place (same
position in the `.md`, same screenshot file) instead of adding a new one;
**Cancel edit** discards the change and goes back to adding new annotations.

## 4) `scripts/group.mjs`: dedicated tab groups

CDP has no tab groups command, but **`Extensions.loadUnpacked`** lets you
load a minimal extension **on the fly** (without relaunching Chrome).
`group.mjs` loads it and runs `chrome.tabs.group` in its service worker,
putting tabs into a "Claude" group so they do not get mixed with yours.

```bash
node scripts/group.mjs open <url> --color orange  # required: opens in the "Claude" group
node scripts/group.mjs status                     # lists groups and tabs
node scripts/group.mjs open <url> --title Work --color blue  # optional custom group
```
The script's built-in title is `Claude` and its built-in color is intentionally
`yellow` (valid colors: grey blue red yellow green pink purple cyan orange).
For normal skill operation, **always pass `--color orange`**; do not edit the
script's default. **`open` reuses an existing group with that title (in any
window) if one is already open**, adding the new tabs to it instead of creating
a duplicate group; only a freshly created group gets its title/color applied,
reusing one leaves it exactly as it was (so it will not silently change color
or expand a group you collapsed by hand). If a pre-existing `Claude` group has
the wrong color, inspect it with `status` and move/use the tab deliberately
rather than creating a second `Claude` group. The console output says `Created
group ...` vs `Reused existing group ...` so you can tell which happened. The
extension lives in `scripts/ext-group/` (only `tabs` + `tabGroups`
permissions).

## Technical notes (read before touching capture logic)

- **Full-page capture width:** use the **emulated viewport**, NOT
  `cssContentSize.width`. Content clipped horizontally (a marquee with
  `overflow-x:clip`) inflates `cssContentSize` and adds an empty strip on the right.
  The current source can measure the tab when `shot --full` is called without
  `--w`, but the required workflow still measures first and passes both `--w`
  and `--h`. This keeps captures tied to the real browser window and works with
  cached plugin copies that still have the historical hardcoded `1440x900`
  fallback. Explicit dimensions also ensure the override is cleared after the
  capture.
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
| Capture size does not match the browser window | Measure with `eval "JSON.stringify({w:innerWidth,h:innerHeight})" <tabId>`, then pass both values as `--w`/`--h`; never rely on the implicit full-page viewport |
| Blank images in the capture | Lazy-load; `cdp.mjs` already does the scroll preload |
| `group.mjs` cannot find the service worker | The extension took a moment to register; retry (the script already waits) |
| Login/CAPTCHA blocks progress | Solve it by hand in the visible window and resume |

Expanded table, with root causes and real historical cases:
`references/troubleshooting.md`.
