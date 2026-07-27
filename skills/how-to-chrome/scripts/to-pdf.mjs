// Exporta una página como PDF de una sola página con la CAPTURA COMPLETA del
// diseño (screenshot full-page al viewport exacto, incrustado como JPEG).
// Fiel al píxel — no reflowea como printToPDF. Cero dependencias.
//
// Uso: node to-pdf.mjs <url> <salida.pdf> [--w 1440] [--mobile] [--wait 2500]

const HOST = process.env.CDP_HOST || "127.0.0.1:9222";
const BASE = `http://${HOST}`;
const MAX_TEXTURA = 16384;

function args() {
  const a = process.argv.slice(2);
  const o = { url: a[0], out: a[1], w: 1440, mobile: false, wait: 2500 };
  for (let i = 2; i < a.length; i++) {
    if (a[i] === "--w") o.w = Number(a[++i]);
    else if (a[i] === "--mobile") o.mobile = true;
    else if (a[i] === "--wait") o.wait = Number(a[++i]);
  }
  return o;
}
async function newTab(url) {
  const r = await fetch(`${BASE}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!r.ok) return (await fetch(`${BASE}/json/new?${encodeURIComponent(url)}`)).json();
  return r.json();
}
const closeTab = (id) => fetch(`${BASE}/json/close/${id}`).catch(() => {});
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); } });
  return { send: (method, params = {}) => new Promise((resolve, reject) => { const mid = ++id; pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params })); }), close: () => ws.close() };
}

// Ancho y alto de un JPEG (marcador SOF).
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("JPEG sin SOF");
}

// PDF mínimo de una página con un JPEG a página completa (DCTDecode).
function pdfConImagen(jpeg) {
  const { w, h } = jpegSize(jpeg);
  const enc = (s) => Buffer.from(s, "latin1");
  const partes = []; let len = 0; const off = [];
  const push = (b) => { const buf = Buffer.isBuffer(b) ? b : enc(b); partes.push(buf); len += buf.length; };
  const obj = (n, body) => { off[n] = len; push(`${n} 0 obj\n`); push(body); push("\nendobj\n"); };

  push("%PDF-1.4\n%\xff\xff\xff\xff\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  // Objeto imagen (stream binario)
  off[4] = len;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg); push("\nendstream\nendobj\n");
  // Contenido: dibuja la imagen ocupando toda la página
  const cont = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`;
  obj(5, `<< /Length ${cont.length} >>\nstream\n${cont}endstream`);

  const xrefOff = len;
  push(`xref\n0 6\n0000000000 65535 f \n`);
  for (let n = 1; n <= 5; n++) push(`${String(off[n]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOff}\n%%EOF`);
  return Buffer.concat(partes);
}

async function main() {
  const o = args();
  if (!o.url || !o.out) { console.error("Uso: node to-pdf.mjs <url> <salida.pdf> [--w 1440] [--mobile]"); process.exit(1); }
  const tab = await newTab("about:blank");
  const cli = await connect(tab.webSocketDebuggerUrl);
  await cli.send("Page.enable");
  await cli.send("Emulation.setDeviceMetricsOverride", { width: o.w, height: 900, deviceScaleFactor: 1, mobile: o.mobile, screenWidth: o.w, screenHeight: 900 });
  if (o.mobile) await cli.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await cli.send("Page.navigate", { url: o.url });
  await new Promise((r) => setTimeout(r, o.wait));

  await cli.send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `(async () => {
      const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
      for (const img of document.images) { img.loading='eager'; if (!img.complete) { const s=img.getAttribute('src'); if (s) { img.src=''; img.src=s; } } }
      const alto = document.documentElement.scrollHeight, paso = window.innerHeight || 800;
      for (let y = 0; y < alto; y += paso) { window.scrollTo(0, y); await dormir(60); }
      window.scrollTo(0, 0);
      const t = Date.now();
      while (Date.now() - t < 3000) { if (![...document.images].some((i) => !(i.complete && i.naturalWidth))) break; await dormir(100); }
    })()`,
  });

  const { cssContentSize } = await cli.send("Page.getLayoutMetrics");
  const width = o.w;                       // fijo al viewport pedido
  const height = Math.ceil(cssContentSize.height);
  const scale = height > MAX_TEXTURA ? MAX_TEXTURA / height : 1;
  const shot = await cli.send("Page.captureScreenshot", {
    format: "jpeg", quality: 82, captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale },
  });
  const jpeg = Buffer.from(shot.data, "base64");
  const { w, h } = jpegSize(jpeg);

  const { writeFile } = await import("node:fs/promises");
  await writeFile(o.out, pdfConImagen(jpeg));
  console.log(`PDF -> ${o.out}  (${w}x${h}px · ${(jpeg.length / 1024).toFixed(0)} KB img)`);

  await closeTab(tab.id);
  cli.close();
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
