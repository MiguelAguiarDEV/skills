// CDP client sobre Chrome DevTools Protocol — cero dependencias (Node 21+ trae WebSocket y fetch nativos).
// Controla el Chrome real lanzado con: chrome --remote-debugging-port=9222 --user-data-dir=<perfil>
//
// Uso:
//   node cdp.mjs tabs                             -> lista pestañas abiertas
//   node cdp.mjs ventanas                         -> lista VENTANAS y qué pestañas tiene cada una
//   node cdp.mjs nav <url> [tabId]                -> navega (crea pestaña si no se da tabId)
//   node cdp.mjs shot <archivo.png> [opts] [tabId]-> captura (opts: --full, --w N, --h N, --mobile)
//   node cdp.mjs text [tabId]                     -> texto visible de la página
//   node cdp.mjs html [tabId]                     -> HTML completo (outerHTML)
//   node cdp.mjs eval "<js>" [tabId]              -> ejecuta JS y devuelve el resultado
//   node cdp.mjs click "<selector>" [tabId]       -> click en el primer match del selector
//   node cdp.mjs type "<selector>" "<txt>" [tabId]-> escribe en un input
//   node cdp.mjs console [tabId]                  -> vuelca mensajes de consola durante 3s
//   node cdp.mjs responsive <url> <outDir>        -> QA: captura breakpoints móvil/tablet/desktop
//
// El "tabId" es el campo "id" que muestra `tabs`.

const HOST = process.env.CDP_HOST || "127.0.0.1:9222";
const BASE = `http://${HOST}`;

// Breakpoints para el modo QA responsive.
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
      const t = setTimeout(() => reject(new Error(`timeout esperando ${method}`)), timeout);
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
    if (!t) throw new Error(`No existe la pestaña ${tabId}`);
    return t;
  }
  if (targets.length) return targets[0];
  return newTab();
}

// Aplica emulación de dispositivo (responsividad real: viewport + DPR + mobile flag).
async function setViewport(cli, { width, height, mobile = false, dsf = 1 }) {
  viewportVigente = { width, height, mobile };
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

// Límite de textura del compositor de Chrome. Si la imagen resultante lo supera,
// Chrome NO falla: repite contenido silenciosamente (una página de 7512px a DPR 3
// da 22536px y sale duplicada). Por eso las capturas full-page van a DPR 1 y,
// si aun así no caben, se reducen con `scale`.
const MAX_TEXTURA = 16384;

// Un screenshot full-page deja en blanco las imágenes con loading="lazy" que
// nunca entran en el viewport real, AUNQUE se hayan cargado antes. La solución
// fiable es forzarlas a eager (quitando el lazy) y esperar a que carguen; así
// captureBeyondViewport las pinta. No tocamos el alto del viewport: hacerlo
// rompe cualquier layout con unidades vh (un hero min-height:92vh se dispararía).
async function precargarLazy(cli) {
  await cli.send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `(async () => {
      const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
      // 1) forzar carga inmediata de todas las imágenes (incluidas las lazy)
      for (const img of document.images) {
        img.loading = 'eager';
        if (!img.complete) { const s = img.getAttribute('src'); if (s) { img.src = ''; img.src = s; } }
      }
      // 2) un barrido de scroll por si hay lazy vía IntersectionObserver/JS propio
      const alto = document.documentElement.scrollHeight, paso = window.innerHeight || 800;
      for (let y = 0; y < alto; y += paso) { window.scrollTo(0, y); await dormir(60); }
      window.scrollTo(0, 0);
      // 3) espera ACOTADA a que terminen (nunca img.decode(): puede colgar). Máx ~3s.
      const inicio = Date.now();
      while (Date.now() - inicio < 3000) {
        if (![...document.images].some((i) => !(i.complete && i.naturalWidth))) break;
        await dormir(100);
      }
    })()`,
  });
}

async function captureFull(cli) {
  // DPR 1: el DPR solo afecta a la nitidez, no al layout, y multiplicar la altura
  // es justo lo que dispara el bug de repetición por límite de textura.
  await cli.send("Emulation.setDeviceMetricsOverride", await metricasActuales(cli, 1));
  await precargarLazy(cli);
  const { cssContentSize } = await cli.send("Page.getLayoutMetrics");
  // Ancho = el viewport EMULADO que fijamos, NO cssContentSize.width: contenido
  // clippeado horizontalmente (p.ej. un marquee con overflow-x:clip) infla
  // cssContentSize y añadiría una franja vacía a la derecha. La altura sí es la
  // del contenido completo (scroll), que es correcta al ancho emulado.
  const width = viewportVigente ? viewportVigente.width : Math.ceil(cssContentSize.width);
  const height = Math.ceil(cssContentSize.height);
  const scale = height > MAX_TEXTURA ? MAX_TEXTURA / height : 1;
  if (scale < 1) {
    console.warn(`  aviso: página de ${height}px reducida a escala ${scale.toFixed(2)} (límite ${MAX_TEXTURA}px)`);
  }
  return cli.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale },
  });
}

// Reaplica el viewport vigente forzando un deviceScaleFactor concreto.
let viewportVigente = null;
async function metricasActuales(cli, dsf) {
  const v = viewportVigente || { width: 1440, height: 900, mobile: false };
  return {
    width: v.width, height: v.height, deviceScaleFactor: dsf, mobile: v.mobile,
    screenWidth: v.width, screenHeight: v.height,
  };
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
    console.log(`OK navegado -> ${url}\n  tabId: ${target.id}\n  título: ${result.value}`);
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
    if (flags.w) await cli.send("Emulation.clearDeviceMetricsOverride");
    console.log(`Captura -> ${out}${flags.w ? ` @ ${flags.w}x${flags.h || 900}` : ""}${flags.full ? " (full page)" : ""}`);
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
    if (exceptionDetails) console.error("Excepción:", exceptionDetails.text);
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
    console.log("--- fin captura de consola (3s) ---");
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
      await new Promise((r) => setTimeout(r, 400)); // dar tiempo a reflow/media queries
      const shot = await captureFull(cli);
      const file = `${outDir}/${bp.name}-${bp.width}x${bp.height}.png`;
      await writeFile(file, Buffer.from(shot.data, "base64"));
      console.log(`  ${bp.name.padEnd(8)} ${bp.width}x${bp.height} -> ${file}`);
    }
    await cli.send("Emulation.clearDeviceMetricsOverride");
    console.log(`QA responsive completado para ${url}`);
    cli.close();
    return;
  }

  if (cmd === "ventanas") {
    // Las ventanas NO se deducen de la lista de procesos: en Chrome todas las
    // ventanas de un mismo perfil cuelgan del proceso raíz, y el MainWindowTitle
    // de Windows solo reporta UNA por proceso (la que esté en primer plano), así
    // que contarlas por ahí siempre da 1. La fuente fiable es el propio navegador:
    // agrupar los targets por el windowId que devuelve Browser.getWindowForTarget.
    const { webSocketDebuggerUrl } = await (await fetch(`${BASE}/json/version`)).json();
    const cli = await connect(webSocketDebuggerUrl); // conexión a nivel navegador
    const ventanas = new Map();
    let total = 0;
    for (const t of await listTargets()) {
      const { windowId, bounds } = await cli.send("Browser.getWindowForTarget", { targetId: t.id }).catch(() => ({}));
      if (windowId === undefined) continue; // target que murió entre medias
      if (!ventanas.has(windowId)) ventanas.set(windowId, { bounds, tabs: [] });
      ventanas.get(windowId).tabs.push(t);
      total++;
    }
    console.log(`${ventanas.size} ventana(s), ${total} pestaña(s)`);
    let n = 0;
    for (const [wid, v] of ventanas) {
      const b = v.bounds || {};
      console.log(`\nVentana ${++n} (id ${wid}) — ${v.tabs.length} pestaña(s)  [${b.width}x${b.height} en ${b.left},${b.top} · ${b.windowState}]`);
      for (const t of v.tabs) console.log(`  ${t.id}  ${t.title}`);
    }
    cli.close();
    return;
  }

  console.log("Comando no reconocido. Ver cabecera de cdp.mjs para el uso.");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
