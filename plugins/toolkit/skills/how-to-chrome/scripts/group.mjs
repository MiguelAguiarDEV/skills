// group.mjs: creates/uses a dedicated Chrome tab GROUP ("Claude") without
// relaunching the browser. Loads a minimal extension via CDP
// (Extensions.loadUnpacked) and runs chrome.tabs.group in its service
// worker. No relaunch, no npm.
//
// Requires Chrome with --remote-debugging-port=9222.
//
// Usage:
//   node group.mjs open <url> [url2 ...]      -> opens those urls in the "Claude" group
//   node group.mjs status                     -> lists the groups and their tabs
//   node group.mjs [--title Claude] [--color yellow]
//
// Valid colors: grey blue red yellow green pink purple cyan orange

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const HOST = process.env.CDP_HOST || "127.0.0.1:9222";
const BASE = `http://${HOST}`;

// The extension path is resolved by CHROME, not Node. If the script runs on
// WSL and Chrome is the Windows binary, /mnt/c/... must be translated to
// C:\...; with the Linux path, Extensions.loadUnpacked replies "File path
// cannot be resolved.".
function pathForChrome(p) {
  try {
    return execFileSync("wslpath", ["-w", p], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return p; // outside WSL there is no wslpath: the path is already native
  }
}
const EXT_DIR = pathForChrome(resolve(dirname(fileURLToPath(import.meta.url)), "ext-group"));

function parse() {
  const a = process.argv.slice(2);
  const o = { cmd: "status", urls: [], title: "Claude", color: "yellow" };
  const rest = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--title") o.title = a[++i];
    else if (a[i] === "--color") o.color = a[++i];
    else rest.push(a[i]);
  }
  if (rest[0]) o.cmd = rest[0];
  o.urls = rest.slice(1);
  return o;
}

// CDP client with session support (sessionId) to talk to targets.
function connect(wsUrl) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map(); const listeners = [];
    ws.addEventListener("open", () => res({
      send: (method, params = {}, sessionId) => new Promise((ok, no) => {
        const mid = ++id; pending.set(mid, { ok, no });
        ws.send(JSON.stringify(sessionId ? { id: mid, method, params, sessionId } : { id: mid, method, params }));
      }),
      on: (fn) => listeners.push(fn),
      close: () => ws.close(),
    }), { once: true });
    ws.addEventListener("error", rej, { once: true });
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { const { ok, no } = pending.get(m.id); pending.delete(m.id); m.error ? no(new Error(JSON.stringify(m.error))) : ok(m.result); }
      else if (m.method) for (const l of listeners) l(m);
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const o = parse();
  const V = await (await fetch(`${BASE}/json/version`)).json();
  const cli = await connect(V.webSocketDebuggerUrl); // browser-level connection

  // 1) Load the extension (if it is already loaded, keep going anyway).
  let extId = null;
  try {
    const r = await cli.send("Extensions.loadUnpacked", { path: EXT_DIR });
    extId = r.id;
    console.log("Extension loaded:", extId);
  } catch (e) {
    console.log("loadUnpacked:", e.message.slice(0, 120), "-> trying to reuse it if it was already loaded");
  }

  // 2) Find the extension's service worker (it shows up as a target).
  let sw = null;
  for (let i = 0; i < 20 && !sw; i++) {
    const { targetInfos } = await cli.send("Target.getTargets");
    sw = targetInfos.find((t) =>
      (t.type === "service_worker" || t.type === "worker") &&
      t.url.startsWith("chrome-extension://") &&
      (extId ? t.url.includes(extId) : t.url.endsWith("/bg.js")));
    if (!sw) await sleep(250);
  }
  if (!sw) throw new Error("Cannot find the extension's service worker. Did Chrome load it?");

  // 3) Attach to the SW and run chrome.tabs/tabGroups inside it.
  const { sessionId } = await cli.send("Target.attachToTarget", { targetId: sw.targetId, flatten: true });
  await cli.send("Runtime.enable", {}, sessionId);
  const evalSW = async (expr) => {
    const { result, exceptionDetails } = await cli.send("Runtime.evaluate",
      { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
    if (exceptionDetails) throw new Error(exceptionDetails.text + " " + (exceptionDetails.exception?.description || ""));
    return result.value;
  };

  if (o.cmd === "open") {
    if (!o.urls.length) throw new Error("Give me at least one url: node group.mjs open <url>");
    const r = await evalSW(`openInGroup(${JSON.stringify(o.urls)}, ${JSON.stringify(o.title)}, ${JSON.stringify(o.color)})`);
    const verb = r.reused ? `Reused existing group "${o.title}"` : `Created group "${o.title}" (${o.color})`;
    console.log(`${verb}, ${r.tabIds.length} tab(s) added. groupId=${r.groupId}`);
  }

  const status = await evalSW("groupsStatus()");
  console.log("\nCurrent groups:");
  for (const g of status) console.log(`  [${g.color}] "${g.title}"${g.collapsed ? " (collapsed)" : ""}, ${g.tabs.length} tab(s): ${g.tabs.map((t) => (t || "").slice(0, 30)).join(" | ")}`);

  cli.close();
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
