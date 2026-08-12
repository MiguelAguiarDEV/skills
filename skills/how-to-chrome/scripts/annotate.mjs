// annotate.mjs: annotate elements on a page (browser + terminal, no editor).
// Injects an overlay into the Chrome tab (via CDP). You select elements,
// write a comment on them, see the list of annotations made so far, and can
// click one to edit it. Every add/update rewrites a .md file (with selector,
// HTML, styles, and a screenshot of the element) ready to paste into any AI.
//
// Requires Chrome with --remote-debugging-port=9222 (use launch-chrome.ps1).
//
// Usage:
//   node annotate.mjs [url] [--out annotations.md] [--tab <tabId>]
//   - If you pass a url, it navigates there; otherwise it uses the active tab.
//   - Keeps the process running: every add/update in the overlay rewrites the .md file.
//   - Ctrl+C to stop.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const HOST = process.env.CDP_HOST || "127.0.0.1:9222";
const BASE = `http://${HOST}`;

function args() {
  const a = process.argv.slice(2);
  const o = { url: null, out: "annotations.md", tab: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--out") o.out = a[++i];
    else if (a[i] === "--tab") o.tab = a[++i];
    else if (!a[i].startsWith("--")) o.url = a[i];
  }
  return o;
}

async function targets() { return (await (await fetch(`${BASE}/json`)).json()).filter((t) => t.type === "page"); }
async function newTab(url) {
  const r = await fetch(`${BASE}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!r.ok) return (await fetch(`${BASE}/json/new?${encodeURIComponent(url)}`)).json();
  return r.json();
}

function connect(wsUrl) {
  return new Promise((resolveConn, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map(); const listeners = [];
    ws.addEventListener("open", () => resolveConn({
      send: (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); }),
      on: (fn) => listeners.push(fn),
      close: () => ws.close(),
    }), { once: true });
    ws.addEventListener("error", reject, { once: true });
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
      else if (m.method) for (const l of listeners) l(m);
    });
  });
}

// Renders the full .md from the current set of annotations, in the order
// they were first added (a Map preserves insertion order; updating an
// existing id in place does not move it).
function render(header, seen) {
  let out = header;
  for (const a of seen.values()) {
    out +=
      `## Annotation ${a.id}\n` +
      `**Comment:** ${a.comment}\n` +
      `**Selector:** \`${a.selector}\`\n` +
      `**Element:** \`${a.tag}\` (${a.w}x${a.h})\n` +
      (a.screenshot ? `**Screenshot:** ${a.screenshot}\n` : "") +
      `**Styles:** ${a.styles}\n\n` +
      "```html\n" + a.html + "\n```\n\n---\n\n";
  }
  return out;
}

async function main() {
  const o = args();
  const overlaySrc = await readFile(new URL("./annotate-overlay.js", import.meta.url), "utf8");

  let target;
  if (o.url) target = await newTab(o.url);
  else {
    const ts = await targets();
    target = o.tab ? ts.find((t) => t.id === o.tab) : ts[0];
    if (!target) throw new Error("No tab available. Open something in Chrome or pass a url.");
  }

  const cli = await connect(target.webSocketDebuggerUrl);
  await cli.send("Page.enable");
  await cli.send("Runtime.enable");

  // Binding: the overlay calls window.sendAnnotation(json), which arrives here.
  await cli.send("Runtime.addBinding", { name: "sendAnnotation" });

  const outPath = resolve(process.cwd(), o.out);
  const shotsDir = resolve(dirname(outPath), "annotation-screenshots");
  await mkdir(shotsDir, { recursive: true });
  const header = `# Annotations: ${target.url || o.url}\n\n`;
  const seen = new Map(); // id -> annotation, rewritten to outPath on every add/update
  await writeFile(outPath, render(header, seen), "utf8");

  cli.on(async (m) => {
    if (m.method !== "Runtime.bindingCalled" || m.params.name !== "sendAnnotation") return;
    let a; try { a = JSON.parse(m.params.payload); } catch { return; }

    // Screenshot of the element (clip in page coordinates). Re-captured on
    // every save (including edits) since it is cheap and keeps the file in
    // sync with whatever rect the annotation currently points to.
    let screenshotRel = "";
    try {
      const r = a.rect;
      if (r && r.width > 2 && r.height > 2) {
        const { data } = await cli.send("Page.captureScreenshot", {
          format: "png", captureBeyondViewport: true,
          clip: { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.ceil(r.width), height: Math.ceil(r.height), scale: 1 },
        });
        const file = `annotation-${String(a.id).padStart(2, "0")}.png`;
        await writeFile(resolve(shotsDir, file), Buffer.from(data, "base64"));
        screenshotRel = `annotation-screenshots/${file}`;
      }
    } catch {}

    seen.set(a.id, { ...a, screenshot: screenshotRel });
    await writeFile(outPath, render(header, seen), "utf8");
    const verb = a.action === "update" ? "Updated" : "Added";
    console.log(`${verb} annotation #${a.id}: "${a.comment.slice(0, 50)}" -> ${a.selector}${screenshotRel ? " (+screenshot)" : ""}`);
  });

  // Inject the overlay (and reinject it on every navigation of the tab).
  const inject = () => cli.send("Runtime.evaluate", { expression: overlaySrc }).catch(() => {});
  await inject();
  cli.on((m) => { if (m.method === "Page.loadEventFired") setTimeout(inject, 300); });

  console.log(`Overlay injected on: ${target.url || o.url}`);
  console.log(`Annotating -> ${outPath}  (screenshots in ${shotsDir})`);
  console.log("Select elements and comment in the browser panel. Click a row in the list to edit it. Ctrl+C to stop.\n");
  // Keep the process alive.
  await new Promise(() => {});
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
