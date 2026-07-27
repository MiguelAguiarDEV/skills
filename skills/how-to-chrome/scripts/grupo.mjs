// grupo.mjs — crea/usa un GRUPO de pestañas propio de Chrome ("Claude") sin
// relanzar el navegador. Carga una extensión mínima por CDP (Extensions.loadUnpacked)
// y ejecuta chrome.tabs.group en su service worker. Cero relanzado, cero npm.
//
// Requiere Chrome con --remote-debugging-port=9222.
//
// Uso:
//   node grupo.mjs abrir <url> [url2 ...]     -> abre esas urls en el grupo "Claude"
//   node grupo.mjs estado                     -> lista los grupos y sus pestañas
//   node grupo.mjs [--titulo Claude] [--color yellow]
//
// Colores válidos: grey blue red yellow green pink purple cyan orange

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const HOST = process.env.CDP_HOST || "127.0.0.1:9222";
const BASE = `http://${HOST}`;

// La ruta de la extensión la resuelve CHROME, no Node. Si el script corre en WSL
// y Chrome es el binario de Windows, hay que traducir /mnt/c/... a C:\...; con la
// ruta de Linux, Extensions.loadUnpacked responde "File path cannot be resolved.".
function rutaParaChrome(p) {
  try {
    return execFileSync("wslpath", ["-w", p], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return p; // fuera de WSL no hay wslpath: la ruta ya es nativa
  }
}
const EXT_DIR = rutaParaChrome(resolve(dirname(fileURLToPath(import.meta.url)), "ext-grupos"));

function parse() {
  const a = process.argv.slice(2);
  const o = { cmd: "estado", urls: [], titulo: "Claude", color: "yellow" };
  const rest = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--titulo") o.titulo = a[++i];
    else if (a[i] === "--color") o.color = a[++i];
    else rest.push(a[i]);
  }
  if (rest[0]) o.cmd = rest[0];
  o.urls = rest.slice(1);
  return o;
}

// Cliente CDP con soporte de sesiones (sessionId) para hablar con targets.
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
  const cli = await connect(V.webSocketDebuggerUrl); // conexión a nivel navegador

  // 1) Cargar la extensión (si ya está cargada, seguimos igualmente).
  let extId = null;
  try {
    const r = await cli.send("Extensions.loadUnpacked", { path: EXT_DIR });
    extId = r.id;
    console.log("Extensión cargada:", extId);
  } catch (e) {
    console.log("loadUnpacked:", e.message.slice(0, 120), "→ intento reutilizar si ya estaba");
  }

  // 2) Encontrar el service worker de la extensión (aparece como target).
  let sw = null;
  for (let i = 0; i < 20 && !sw; i++) {
    const { targetInfos } = await cli.send("Target.getTargets");
    sw = targetInfos.find((t) =>
      (t.type === "service_worker" || t.type === "worker") &&
      t.url.startsWith("chrome-extension://") &&
      (extId ? t.url.includes(extId) : t.url.endsWith("/bg.js")));
    if (!sw) await sleep(250);
  }
  if (!sw) throw new Error("No encuentro el service worker de la extensión. ¿La cargó Chrome?");

  // 3) Adjuntarse al SW y ejecutar chrome.tabs/tabGroups ahí dentro.
  const { sessionId } = await cli.send("Target.attachToTarget", { targetId: sw.targetId, flatten: true });
  await cli.send("Runtime.enable", {}, sessionId);
  const evalSW = async (expr) => {
    const { result, exceptionDetails } = await cli.send("Runtime.evaluate",
      { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
    if (exceptionDetails) throw new Error(exceptionDetails.text + " " + (exceptionDetails.exception?.description || ""));
    return result.value;
  };

  if (o.cmd === "abrir") {
    if (!o.urls.length) throw new Error("Dame al menos una url: node grupo.mjs abrir <url>");
    const r = await evalSW(`abrirEnGrupo(${JSON.stringify(o.urls)}, ${JSON.stringify(o.titulo)}, ${JSON.stringify(o.color)})`);
    console.log(`Grupo "${o.titulo}" (${o.color}) creado con ${r.tabIds.length} pestaña(s). groupId=${r.groupId}`);
  }

  const estado = await evalSW("estadoGrupos()");
  console.log("\nGrupos actuales:");
  for (const g of estado) console.log(`  [${g.color}] "${g.titulo}"${g.collapsed ? " (colapsado)" : ""} — ${g.pestanas.length} pestaña(s): ${g.pestanas.map((t) => (t || "").slice(0, 30)).join(" | ")}`);

  cli.close();
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
