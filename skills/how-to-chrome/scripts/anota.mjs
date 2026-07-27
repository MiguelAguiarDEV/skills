// anota.mjs — anotar elementos de una web (navegador + terminal, sin editor).
// Inyecta un overlay en la pestaña de Chrome (CDP). Seleccionas elementos, les
// pones un comentario, y cada anotación se vuelca a un .md (con selector, HTML,
// estilos y captura del elemento) listo para pegar a cualquier IA.
//
// Requiere Chrome con --remote-debugging-port=9222 (usa launch-chrome.ps1).
//
// Uso:
//   node anota.mjs [url] [--out anotaciones.md] [--tab <tabId>]
//   - Si das url, navega ahí; si no, usa la pestaña activa.
//   - Deja el proceso corriendo: cada "Añadir anotación" en el overlay escribe al .md.
//   - Ctrl+C para terminar.

import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const HOST = process.env.CDP_HOST || "127.0.0.1:9222";
const BASE = `http://${HOST}`;

function args() {
  const a = process.argv.slice(2);
  const o = { url: null, out: "anotaciones.md", tab: null };
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

async function main() {
  const o = args();
  const overlaySrc = await readFile(new URL("./anota-overlay.js", import.meta.url), "utf8");

  let target;
  if (o.url) target = await newTab(o.url);
  else {
    const ts = await targets();
    target = o.tab ? ts.find((t) => t.id === o.tab) : ts[0];
    if (!target) throw new Error("No hay pestaña. Abre algo en Chrome o pasa una url.");
  }

  const cli = await connect(target.webSocketDebuggerUrl);
  await cli.send("Page.enable");
  await cli.send("Runtime.enable");

  // Binding: el overlay llama window.anotaEnviar(json) -> llega aquí.
  await cli.send("Runtime.addBinding", { name: "anotaEnviar" });

  const outPath = resolve(process.cwd(), o.out);
  const shotsDir = resolve(dirname(outPath), "anotaciones-capturas");
  await mkdir(shotsDir, { recursive: true });
  await writeFile(outPath, `# Anotaciones — ${target.url || o.url}\n\n`, "utf8");

  let n = 0;
  cli.on(async (m) => {
    if (m.method !== "Runtime.bindingCalled" || m.params.name !== "anotaEnviar") return;
    n++;
    let a; try { a = JSON.parse(m.params.payload); } catch { return; }

    // Captura del elemento (clip en coords de página).
    let capturaRel = "";
    try {
      const r = a.rect;
      if (r && r.width > 2 && r.height > 2) {
        const { data } = await cli.send("Page.captureScreenshot", {
          format: "png", captureBeyondViewport: true,
          clip: { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.ceil(r.width), height: Math.ceil(r.height), scale: 1 },
        });
        const file = `anot-${String(n).padStart(2, "0")}.png`;
        await writeFile(resolve(shotsDir, file), Buffer.from(data, "base64"));
        capturaRel = `anotaciones-capturas/${file}`;
      }
    } catch {}

    const bloque =
      `## Anotación ${n}\n` +
      `**Comentario:** ${a.comentario}\n` +
      `**Selector:** \`${a.selector}\`\n` +
      `**Elemento:** \`${a.tag}\` (${a.w}×${a.h})\n` +
      (capturaRel ? `**Captura:** ${capturaRel}\n` : "") +
      `**Estilos:** ${a.estilos}\n\n` +
      "```html\n" + a.html + "\n```\n\n---\n\n";
    await appendFile(outPath, bloque, "utf8");
    console.log(`✓ Anotación ${n}: "${a.comentario.slice(0, 50)}" -> ${a.selector}${capturaRel ? " (+captura)" : ""}`);
  });

  // Inyecta el overlay (y lo reinyecta en cada navegación de la pestaña).
  const inyecta = () => cli.send("Runtime.evaluate", { expression: overlaySrc }).catch(() => {});
  await inyecta();
  cli.on((m) => { if (m.method === "Page.loadEventFired") setTimeout(inyecta, 300); });

  console.log(`Overlay inyectado en: ${target.url || o.url}`);
  console.log(`Anotando -> ${outPath}  (capturas en ${shotsDir})`);
  console.log("Selecciona elementos y comenta en el panel del navegador. Ctrl+C para terminar.\n");
  // Mantener vivo.
  await new Promise(() => {});
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
