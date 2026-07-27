// Overlay de anotación: se inyecta en la página. Deja seleccionar elementos con
// el ratón (incluyendo padres cubiertos por sus hijos, navegando la pila con
// ⬆/⬇ o flechas del teclado), escribirles un comentario, y manda cada anotación
// al terminal vía window.anotaEnviar (binding CDP). También copia todo al portapapeles.
(() => {
  if (window.__anota) { window.__anota.panel.style.display = "flex"; return; }

  const $ = (t, p = {}) => Object.assign(document.createElement(t), p);
  const anotaciones = [];

  const desc = (el) => {
    if (!el || !el.nodeName) return "?";
    const cls = (el.getAttribute && el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
    return el.nodeName.toLowerCase() + (el.id ? "#" + el.id : "") + (cls.length ? "." + cls.join(".") : "");
  };

  function cssPath(el) {
    if (!(el instanceof Element)) return "";
    const partes = [];
    while (el && el.nodeType === 1 && partes.length < 5) {
      let sel = el.nodeName.toLowerCase();
      if (el.id) { sel += "#" + el.id; partes.unshift(sel); break; }
      const cls = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) sel += "." + cls.join(".");
      const p = el.parentElement;
      if (p) {
        const iguales = [...p.children].filter((c) => c.nodeName === el.nodeName);
        if (iguales.length > 1) sel += ":nth-child(" + ([...p.children].indexOf(el) + 1) + ")";
      }
      partes.unshift(sel);
      el = el.parentElement;
    }
    return partes.join(" > ");
  }

  function estilos(el) {
    const s = getComputedStyle(el);
    const keys = ["display", "color", "background-color", "font-size", "font-weight", "padding", "margin", "border-radius", "width", "height"];
    return keys.map((k) => k + ": " + s.getPropertyValue(k)).join("; ");
  }

  // ── Resaltado ──
  // position:absolute + coords de PÁGINA (no del viewport): así el recuadro se
  // mueve junto con el documento al hacer scroll y no se desalinea/muere.
  const marca = $("div", { id: "__anotaMarca" });
  Object.assign(marca.style, {
    position: "absolute", zIndex: 2147483646, pointerEvents: "none",
    border: "2px solid #FFC20E", background: "rgba(255,194,14,0.12)",
    borderRadius: "3px", display: "none", boxSizing: "border-box",
  });
  document.body.appendChild(marca);
  function resaltar(el) {
    if (!el || !el.getBoundingClientRect) { marca.style.display = "none"; return; }
    const r = el.getBoundingClientRect();
    Object.assign(marca.style, {
      display: "block",
      left: (r.left + window.scrollX) + "px",
      top: (r.top + window.scrollY) + "px",
      width: r.width + "px", height: r.height + "px",
    });
  }

  let seleccionando = false;
  let pila = [];        // elementos apilados en el punto del clic (hijo -> ... -> raíz)
  let nivel = 0;        // índice actual dentro de la pila
  let elegido = null;

  function mostrarElegido() {
    elegido = pila[nivel] || null;
    resaltar(elegido);
    if (elegido) {
      info.innerHTML = "<b>" + desc(elegido) + "</b> · nivel " + (nivel + 1) + "/" + pila.length +
        " <span style='opacity:.6'>(⬆/⬇ o flechas para navegar)</span>";
      btnUp.disabled = nivel >= pila.length - 1;
      btnDown.disabled = nivel <= 0;
    } else {
      info.textContent = "Ningún elemento seleccionado";
      btnUp.disabled = btnDown.disabled = true;
    }
  }
  const subir = () => { if (nivel < pila.length - 1) { nivel++; mostrarElegido(); } };
  const bajar = () => { if (nivel > 0) { nivel--; mostrarElegido(); } };

  function alMover(e) {
    if (!seleccionando) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === marca || panel.contains(el)) { marca.style.display = "none"; return; }
    resaltar(el);
    marca.__el = el;
  }
  function alClic(e) {
    if (!seleccionando) return;
    e.preventDefault(); e.stopPropagation();
    // Pila completa de elementos en ese punto: hijo -> padre -> ... (así se puede
    // subir a un div aunque esté totalmente cubierto por sus hijos).
    pila = document.elementsFromPoint(e.clientX, e.clientY).filter((el) => el !== marca && !panel.contains(el) && el.nodeName !== "HTML");
    nivel = 0;
    seleccionando = false;
    document.body.style.cursor = "";
    btnSel.textContent = "🎯 Seleccionar elemento";
    coment.focus();
    mostrarElegido();
  }
  document.addEventListener("mousemove", alMover, true);
  document.addEventListener("click", alClic, true);
  document.addEventListener("keydown", (e) => {
    if (!window.__anota || panel.style.display === "none") return;
    if (document.activeElement === coment) return;   // no interferir al escribir
    if (e.key === "ArrowUp") { e.preventDefault(); subir(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); bajar(); }
    else if (e.key === "Escape") { seleccionando = false; document.body.style.cursor = ""; marca.style.display = "none"; btnSel.textContent = "🎯 Seleccionar elemento"; }
  }, true);

  // Recolocar el recuadro al hacer scroll/resize para que siga pegado al elemento
  // seleccionado (por si hay sticky/fixed o la maqueta se reajusta).
  let raf = 0;
  const reRender = () => { if (elegido && !seleccionando) resaltar(elegido); };
  window.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(reRender); }, true);
  window.addEventListener("resize", reRender);

  // ── Panel ──
  const panel = $("div");
  Object.assign(panel.style, {
    position: "fixed", zIndex: 2147483647, left: "16px", bottom: "16px", width: "330px",
    display: "flex", flexDirection: "column", gap: "8px",
    background: "#0E1223", color: "#F5F7FA", border: "1px solid #263048", borderRadius: "12px",
    padding: "14px", font: "14px/1.4 system-ui, sans-serif", boxShadow: "0 12px 40px rgba(0,0,0,.5)",
  });

  const tit = $("div", { textContent: "Anotar para IA" });
  Object.assign(tit.style, { fontWeight: "700", color: "#FFC20E", display: "flex", justifyContent: "space-between", alignItems: "center" });
  const cerrar = $("span", { textContent: "✕", title: "Cerrar" });
  Object.assign(cerrar.style, { cursor: "pointer", opacity: ".7" });
  cerrar.onclick = () => { panel.style.display = "none"; marca.style.display = "none"; };
  tit.appendChild(cerrar);

  const btnSel = $("button", { textContent: "🎯 Seleccionar elemento" });
  const info = $("div");
  info.textContent = "Ningún elemento seleccionado";
  Object.assign(info.style, { fontSize: "12px", color: "#A9B4C7", minHeight: "16px" });

  // Navegar la jerarquía en el punto seleccionado.
  const nav = $("div");
  Object.assign(nav.style, { display: "flex", gap: "6px" });
  const btnUp = $("button", { textContent: "⬆ Padre", disabled: true });
  const btnDown = $("button", { textContent: "⬇ Hijo", disabled: true });
  btnUp.onclick = subir; btnDown.onclick = bajar;
  nav.append(btnUp, btnDown);

  const coment = $("textarea", { placeholder: "Comentario para la IA…", rows: 3 });
  const btnAdd = $("button", { textContent: "＋ Añadir anotación" });
  const contador = $("div", { textContent: "0 anotaciones" });
  Object.assign(contador.style, { fontSize: "12px", color: "#A9B4C7" });
  const btnCopy = $("button", { textContent: "📋 Copiar todo para IA" });

  for (const b of [btnSel, btnAdd, btnCopy, btnUp, btnDown]) {
    Object.assign(b.style, { padding: "9px 12px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "700", fontFamily: "inherit" });
  }
  btnSel.style.background = "#1B2236"; btnSel.style.color = "#F5F7FA";
  for (const b of [btnUp, btnDown]) { b.style.background = "#1B2236"; b.style.color = "#F5F7FA"; b.style.flex = "1"; }
  btnAdd.style.background = "#FFC20E"; btnAdd.style.color = "#0B0D14";
  btnCopy.style.background = "#25D366"; btnCopy.style.color = "#06281a";
  Object.assign(coment.style, { width: "100%", boxSizing: "border-box", background: "#07090F", color: "#F5F7FA", border: "1px solid #3A4766", borderRadius: "8px", padding: "8px", font: "inherit", resize: "vertical" });

  panel.append(tit, btnSel, info, nav, coment, btnAdd, contador, btnCopy);
  document.body.appendChild(panel);

  btnSel.onclick = () => {
    seleccionando = !seleccionando;
    btnSel.textContent = seleccionando ? "✋ Cancelar (clic en un elemento)" : "🎯 Seleccionar elemento";
    document.body.style.cursor = seleccionando ? "crosshair" : "";
    if (!seleccionando) marca.style.display = "none";
  };

  function markdown() {
    return anotaciones.map((a, i) =>
      "## Anotación " + (i + 1) + "\n" +
      "**Comentario:** " + a.comentario + "\n" +
      "**Selector:** `" + a.selector + "`\n" +
      "**Elemento:** `" + a.tag + "` (" + a.w + "×" + a.h + ")\n" +
      (a.captura ? "**Captura:** " + a.captura + "\n" : "") +
      "**Estilos:** " + a.estilos + "\n\n" +
      "```html\n" + a.html + "\n```"
    ).join("\n\n---\n\n");
  }

  btnAdd.onclick = () => {
    if (!elegido) { info.textContent = "Selecciona un elemento primero"; return; }
    const c = coment.value.trim();
    if (!c) { coment.focus(); return; }
    const r = elegido.getBoundingClientRect();
    const a = {
      comentario: c, selector: cssPath(elegido), tag: desc(elegido),
      w: Math.round(r.width), h: Math.round(r.height),
      estilos: estilos(elegido), html: (elegido.outerHTML || "").slice(0, 600), url: location.href,
      rect: { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height },
    };
    anotaciones.push(a);
    contador.textContent = anotaciones.length + " anotacion" + (anotaciones.length === 1 ? "" : "es");
    if (window.anotaEnviar) window.anotaEnviar(JSON.stringify(a));
    coment.value = ""; pila = []; nivel = 0; elegido = null; marca.style.display = "none";
    info.textContent = "Ningún elemento seleccionado"; btnUp.disabled = btnDown.disabled = true;
  };

  btnCopy.onclick = async () => {
    if (!anotaciones.length) { btnCopy.textContent = "Nada que copiar"; return; }
    try { await navigator.clipboard.writeText(markdown()); btnCopy.textContent = "✓ Copiado"; }
    catch { btnCopy.textContent = "Copia manual desde el terminal"; }
    setTimeout(() => (btnCopy.textContent = "📋 Copiar todo para IA"), 1600);
  };

  window.__anota = { panel, anotaciones, markdown, resaltar };
  console.log("[anota] overlay activo — clic en un elemento y usa ⬆/⬇ o flechas para navegar padres/hijos");
})();
