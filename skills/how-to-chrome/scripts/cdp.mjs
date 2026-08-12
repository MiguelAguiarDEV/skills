// CDP client over the Chrome DevTools Protocol, zero dependencies (Node 21+ ships native WebSocket and fetch).
// Controls the real Chrome launched with: chrome --remote-debugging-port=9222 --user-data-dir=<profile>
//
// Usage:
//   node cdp.mjs tabs                             -> list open tabs
//   node cdp.mjs windows                          -> list WINDOWS and which tabs each one has
//   node cdp.mjs nav <url> [tabId]                -> navigate (creates a tab if tabId is not given)
//   node cdp.mjs shot <file.png> [opts] [tabId]   -> capture (opts: --full, --w N, --h N, --mobile)
//   node cdp.mjs text [tabId]                     -> visible page text
//   node cdp.mjs html [tabId]                     -> full HTML (outerHTML)
//   node cdp.mjs eval "<js>" [tabId]              -> run JS and return the result
//   node cdp.mjs click "<selector>" [tabId]       -> click the first match of the selector
//   node cdp.mjs type "<selector>" "<text>" [tabId] -> type into an input
//   node cdp.mjs console [tabId]                  -> dump console messages for 3s
//   node cdp.mjs responsive <url> <outDir>        -> QA: capture mobile/tablet/desktop breakpoints
//
// The "tabId" is the "id" field shown by `tabs`.

const HOST = process.env.CDP_HOST || "127.0.0.1:9222";
const BASE = `http://${HOST}`;

// Breakpoints for the responsive QA mode.
const BREAKPOINTS = [
  { name: "mobile", width: 375, height: 812, mobile: true, dsf: 3 },
  { name: "tablet", width: 768, height: 1024, mobile: true, dsf: 2 },
  { name: "laptop", width: 1366, height: 768, mobile: false, dsf: 1 },
  { name: "desktop", width: 1920, height: 1080, mobile: false, dsf: 1 },
];

async function listTargets() {
  const r = await fetch(`${BASE}/json`);
  return (await r.json()).filter((t) => t.type === "page");
}

async function newTab(url = "about:blank") {
  const r = await fetch(`${BASE}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!r.ok) {
    const r2 = await fetch(`${BASE}/json/new?${encodeURIComponent(url)}`);
    return r2.json();
  }
  return r.json();
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  const on = (fn) => listeners.push(fn);
  const waitFor = (method, timeout = 15000) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), timeout);
      const l = (m) => {
        if (m.method === method) {
          clearTimeout(t);
          listeners.splice(listeners.indexOf(l), 1);
          resolve(m.params);
        }
      };
      listeners.push(l);
    });
  return { send, on, waitFor, close: () => ws.close() };
}

async function resolveTarget(tabId) {
  const targets = await listTargets();
  if (tabId) {
    const t = targets.find((x) => x.id === tabId);
    if (!t) throw new Error(`Tab ${tabId} does not exist`);
    return t;
  }
  if (targets.length) return targets[0];
  return newTab();
}

// Applies device emulation (real responsiveness: viewport + DPR + mobile flag).
async function setViewport(cli, { width, height, mobile = false, dsf = 1 }) {
  currentViewport = { width, height, mobile };
  await cli.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: dsf,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
  if (mobile) {
    await cli.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  }
}

// Chrome's compositor texture limit. If the resulting image exceeds it,
// Chrome does NOT fail: it silently repeats content (a 7512px page at DPR 3
// gives 22536px and comes out duplicated). That's why full-page captures use
// DPR 1 and, if they still do not fit, get reduced with `scale`.
const MAX_TEXTURE = 16384;

// A full-page screenshot leaves images with loading="lazy" blank if they
// never enter the real viewport, EVEN IF they had already loaded. The
// reliable fix is forcing them to eager (removing the lazy attribute) and
// waiting for them to load; that way captureBeyondViewport paints them. We
// do not touch the viewport height: doing so breaks any layout using vh
// units (a hero with min-height:92vh would misfire).
async function preloadLazy(cli) {
  await cli.send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      // 1) force immediate loading of all images (including lazy ones)
      for (const img of document.images) {
        img.loading = 'eager';
        if (!img.complete) { const s = img.getAttribute('src'); if (s) { img.src = ''; img.src = s; } }
      }
      // 2) a scroll sweep in case there is lazy loading via IntersectionObserver/custom JS
      const totalHeight = document.documentElement.scrollHeight, step = window.innerHeight || 800;
      for (let y = 0; y < totalHeight; y += step) { window.scrollTo(0, y); await sleep(60); }
      window.scrollTo(0, 0);
      // 3) bounded wait for them to finish (never img.decode(): it can hang). Max ~3s.
      const start = Date.now();
      while (Date.now() - start < 3000) {
        if (![...document.images].some((i) => !(i.complete && i.naturalWidth))) break;
        await sleep(100);
      }
    })()`,
  });
}

async function captureFull(cli) {
  // DPR 1: DPR only affects sharpness, not layout, and multiplying the
  // height is exactly what triggers the texture-limit repetition bug.
  const metrics = await currentMetrics(cli, 1);
  await cli.send("Emulation.setDeviceMetricsOverride", metrics);
  await preloadLazy(cli);
  const { cssContentSize } = await cli.send("Page.getLayoutMetrics");
  // Width = the viewport just forced above (the tab's real current size when
  // no explicit --w was given, or the requested --w), NOT cssContentSize.width:
  // content clipped horizontally (e.g. a marquee with overflow-x:clip) inflates
  // cssContentSize and would add an empty strip on the right. Height is
  // correctly the full scroll height at that width.
  const width = metrics.width;
  const height = Math.ceil(cssContentSize.height);
  const scale = height > MAX_TEXTURE ? MAX_TEXTURE / height : 1;
  if (scale < 1) {
    console.warn(`  warning: page of ${height}px scaled down to ${scale.toFixed(2)} (limit ${MAX_TEXTURE}px)`);
  }
  return cli.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale },
  });
}

// Reapplies the current viewport forcing a specific deviceScaleFactor. When
// no explicit viewport was requested (no --w), measures the tab's real
// current size instead of guessing, so a plain `shot --full` matches the
// actual browser window instead of a hardcoded default.
let currentViewport = null;
async function currentMetrics(cli, dsf) {
  if (currentViewport) {
    const v = currentViewport;
    return {
      width: v.width, height: v.height, deviceScaleFactor: dsf, mobile: v.mobile,
      screenWidth: v.width, screenHeight: v.height,
    };
  }
  const { result } = await cli.send("Runtime.evaluate", {
    expression: "JSON.stringify([window.innerWidth, window.innerHeight])",
    returnByValue: true,
  });
  const [w, h] = JSON.parse(result.value);
  return { width: w, height: h, deviceScaleFactor: dsf, mobile: false, screenWidth: w, screenHeight: h };
}

function parseFlags(args) {
  const flags = { full: false, mobile: false, w: null, h: null };
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--full") flags.full = true;
    else if (a === "--mobile") flags.mobile = true;
    else if (a === "--w") flags.w = Number(args[++i]);
    else if (a === "--h") flags.h = Number(args[++i]);
    else rest.push(a);
  }
  return { flags, rest };
}

async function main() {
  const [cmd, ...rawArgs] = process.argv.slice(2);
  const { writeFile, mkdir } = await import("node:fs/promises");

  if (cmd === "tabs") {
    for (const t of await listTargets()) console.log(`${t.id}  ${t.title}\n     ${t.url}`);
    return;
  }

  if (cmd === "nav") {
    const [url, tabId] = rawArgs;
    const target = tabId ? await resolveTarget(tabId) : await newTab(url);
    const cli = await connect(target.webSocketDebuggerUrl);
    await cli.send("Page.enable");
    if (tabId) await cli.send("Page.navigate", { url });
    await cli.waitFor("Page.loadEventFired").catch(() => {});
    const { result } = await cli.send("Runtime.evaluate", { expression: "document.title" });
    console.log(`OK navigated -> ${url}\n  tabId: ${target.id}\n  title: ${result.value}`);
    cli.close();
    return;
  }

  if (cmd === "shot") {
    const { flags, rest } = parseFlags(rawArgs);
    const out = rest[0] || "screenshot.png";
    const target = await resolveTarget(rest[1]);
    const cli = await connect(target.webSocketDebuggerUrl);
    await cli.send("Page.enable");
    if (flags.w) await setViewport(cli, { width: flags.w, height: flags.h || 900, mobile: flags.mobile });
    const shot = flags.full ? await captureFull(cli) : await cli.send("Page.captureScreenshot", { format: "png" });
    await writeFile(out, Buffer.from(shot.data, "base64"));
    // captureFull always applies an override (even with no --w, to force DPR 1),
    // so clear it whenever --full or --w was used, not just for explicit --w.
    if (flags.full || flags.w) await cli.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
    console.log(`Capture -> ${out}${flags.w ? ` @ ${flags.w}x${flags.h || 900}` : ""}${flags.full ? " (full page)" : ""}`);
    cli.close();
    return;
  }

  if (cmd === "text" || cmd === "html") {
    const target = await resolveTarget(rawArgs[0]);
    const cli = await connect(target.webSocketDebuggerUrl);
    const expr = cmd === "text" ? "document.body.innerText" : "document.documentElement.outerHTML";
    const { result } = await cli.send("Runtime.evaluate", { expression: expr });
    console.log(result.value);
    cli.close();
    return;
  }

  if (cmd === "eval") {
    const target = await resolveTarget(rawArgs[1]);
    const cli = await connect(target.webSocketDebuggerUrl);
    const { result, exceptionDetails } = await cli.send("Runtime.evaluate", {
      expression: rawArgs[0],
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) console.error("Exception:", exceptionDetails.text);
    else console.log(typeof result.value === "object" ? JSON.stringify(result.value, null, 2) : result.value);
    cli.close();
    return;
  }

  if (cmd === "click") {
    const target = await resolveTarget(rawArgs[1]);
    const cli = await connect(target.webSocketDebuggerUrl);
    const { result } = await cli.send("Runtime.evaluate", {
      expression: `(() => { const el = document.querySelector(${JSON.stringify(rawArgs[0])}); if(!el) return "NO_MATCH"; el.click(); return "CLICKED"; })()`,
      returnByValue: true,
    });
    console.log(`${rawArgs[0]} -> ${result.value}`);
    cli.close();
    return;
  }

  if (cmd === "type") {
    const target = await resolveTarget(rawArgs[2]);
    const cli = await connect(target.webSocketDebuggerUrl);
    const { result } = await cli.send("Runtime.evaluate", {
      expression: `(() => { const el = document.querySelector(${JSON.stringify(rawArgs[0])}); if(!el) return "NO_MATCH"; el.focus(); el.value=${JSON.stringify(rawArgs[1])}; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return "TYPED"; })()`,
      returnByValue: true,
    });
    console.log(`${rawArgs[0]} -> ${result.value}`);
    cli.close();
    return;
  }

  if (cmd === "console") {
    const target = await resolveTarget(rawArgs[0]);
    const cli = await connect(target.webSocketDebuggerUrl);
    await cli.send("Runtime.enable");
    await cli.send("Log.enable");
    cli.on((m) => {
      if (m.method === "Runtime.consoleAPICalled") {
        const args = (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
        console.log(`[${m.params.type}] ${args}`);
      }
      if (m.method === "Log.entryAdded") {
        console.log(`[${m.params.entry.level}] ${m.params.entry.text}`);
      }
      if (m.method === "Runtime.exceptionThrown") {
        console.log(`[exception] ${m.params.exceptionDetails.text}`);
      }
    });
    await new Promise((r) => setTimeout(r, 3000));
    console.log("--- end of console capture (3s) ---");
    cli.close();
    return;
  }

  if (cmd === "responsive") {
    const [url, outDir = "responsive-qa"] = rawArgs;
    await mkdir(outDir, { recursive: true });
    const target = await newTab(url);
    const cli = await connect(target.webSocketDebuggerUrl);
    await cli.send("Page.enable");
    await cli.waitFor("Page.loadEventFired").catch(() => {});
    for (const bp of BREAKPOINTS) {
      await setViewport(cli, bp);
      await new Promise((r) => setTimeout(r, 400)); // give reflow/media queries time to settle
      const shot = await captureFull(cli);
      const file = `${outDir}/${bp.name}-${bp.width}x${bp.height}.png`;
      await writeFile(file, Buffer.from(shot.data, "base64"));
      console.log(`  ${bp.name.padEnd(8)} ${bp.width}x${bp.height} -> ${file}`);
    }
    await cli.send("Emulation.clearDeviceMetricsOverride");
    console.log(`Responsive QA completed for ${url}`);
    cli.close();
    return;
  }

  if (cmd === "windows") {
    // Windows are NOT inferred from the process list: in Chrome, every
    // window of the same profile hangs off the root process, and Windows'
    // MainWindowTitle only reports ONE per process (whichever is in the
    // foreground), so counting that way always gives 1. The reliable source
    // is the browser itself: group targets by the windowId returned by
    // Browser.getWindowForTarget.
    const { webSocketDebuggerUrl } = await (await fetch(`${BASE}/json/version`)).json();
    const cli = await connect(webSocketDebuggerUrl); // browser-level connection
    const windows = new Map();
    let total = 0;
    for (const t of await listTargets()) {
      const { windowId, bounds } = await cli.send("Browser.getWindowForTarget", { targetId: t.id }).catch(() => ({}));
      if (windowId === undefined) continue; // target that died in the meantime
      if (!windows.has(windowId)) windows.set(windowId, { bounds, tabs: [] });
      windows.get(windowId).tabs.push(t);
      total++;
    }
    console.log(`${windows.size} window(s), ${total} tab(s)`);
    let n = 0;
    for (const [wid, v] of windows) {
      const b = v.bounds || {};
      console.log(`\nWindow ${++n} (id ${wid}), ${v.tabs.length} tab(s)  [${b.width}x${b.height} at ${b.left},${b.top} - ${b.windowState}]`);
      for (const t of v.tabs) console.log(`  ${t.id}  ${t.title}`);
    }
    cli.close();
    return;
  }

  console.log("Unrecognized command. See the header of cdp.mjs for usage.");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
