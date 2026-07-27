// Annotation overlay: injected into the page. Lets you select elements with
// the mouse (including parents covered by their children, navigating the
// stack with Up/Down or arrow keys), write a comment on them, see the list of
// annotations made so far, click one to edit it, and sends each add/update to
// the terminal via window.sendAnnotation (CDP binding). Also copies
// everything to the clipboard.
(() => {
  if (window.__anota) { window.__anota.panel.style.display = "flex"; return; }

  const $ = (t, p = {}) => Object.assign(document.createElement(t), p);
  const annotations = [];
  let nextId = 1;
  let editingId = null;

  const desc = (el) => {
    if (!el || !el.nodeName) return "?";
    const cls = (el.getAttribute && el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
    return el.nodeName.toLowerCase() + (el.id ? "#" + el.id : "") + (cls.length ? "." + cls.join(".") : "");
  };

  function cssPath(el) {
    if (!(el instanceof Element)) return "";
    const parts = [];
    while (el && el.nodeType === 1 && parts.length < 5) {
      let sel = el.nodeName.toLowerCase();
      if (el.id) { sel += "#" + el.id; parts.unshift(sel); break; }
      const cls = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) sel += "." + cls.join(".");
      const p = el.parentElement;
      if (p) {
        const siblings = [...p.children].filter((c) => c.nodeName === el.nodeName);
        if (siblings.length > 1) sel += ":nth-child(" + ([...p.children].indexOf(el) + 1) + ")";
      }
      parts.unshift(sel);
      el = el.parentElement;
    }
    return parts.join(" > ");
  }

  function styles(el) {
    const s = getComputedStyle(el);
    const keys = ["display", "color", "background-color", "font-size", "font-weight", "padding", "margin", "border-radius", "width", "height"];
    return keys.map((k) => k + ": " + s.getPropertyValue(k)).join("; ");
  }

  // -- Highlight --
  // position:absolute + PAGE coordinates (not viewport): this way the box
  // moves along with the document when scrolling and does not drift or die.
  const marker = $("div", { id: "__anotaMarca" });
  Object.assign(marker.style, {
    position: "absolute", zIndex: 2147483646, pointerEvents: "none",
    border: "2px solid #FFC20E", background: "rgba(255,194,14,0.12)",
    borderRadius: "3px", display: "none", boxSizing: "border-box",
  });
  document.body.appendChild(marker);
  function highlight(el) {
    if (!el || !el.getBoundingClientRect) { marker.style.display = "none"; return; }
    const r = el.getBoundingClientRect();
    Object.assign(marker.style, {
      display: "block",
      left: (r.left + window.scrollX) + "px",
      top: (r.top + window.scrollY) + "px",
      width: r.width + "px", height: r.height + "px",
    });
  }

  let selecting = false;
  let stack = [];        // elements stacked at the click point (child -> ... -> root)
  let level = 0;         // current index within the stack
  let chosen = null;

  function showChosen() {
    chosen = stack[level] || null;
    highlight(chosen);
    if (chosen) {
      info.innerHTML = "<b>" + desc(chosen) + "</b> - level " + (level + 1) + "/" + stack.length +
        " <span style='opacity:.6'>(Up/Down or arrow keys to navigate)</span>";
      btnUp.disabled = level >= stack.length - 1;
      btnDown.disabled = level <= 0;
    } else {
      info.textContent = "No element selected";
      btnUp.disabled = btnDown.disabled = true;
    }
  }
  const goUp = () => { if (level < stack.length - 1) { level++; showChosen(); } };
  const goDown = () => { if (level > 0) { level--; showChosen(); } };

  function onMove(e) {
    if (!selecting) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === marker || panel.contains(el)) { marker.style.display = "none"; return; }
    highlight(el);
    marker.__el = el;
  }
  function onClick(e) {
    if (!selecting) return;
    e.preventDefault(); e.stopPropagation();
    // Full stack of elements at that point: child -> parent -> ... (this way
    // you can move up to a div even if it is fully covered by its children).
    stack = document.elementsFromPoint(e.clientX, e.clientY).filter((el) => el !== marker && !panel.contains(el) && el.nodeName !== "HTML");
    level = 0;
    selecting = false;
    document.body.style.cursor = "";
    btnSel.textContent = "Select element";
    comment.focus();
    showChosen();
  }
  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", (e) => {
    if (!window.__anota || panel.style.display === "none") return;
    if (document.activeElement === comment) return;   // do not interfere while typing
    if (e.key === "ArrowUp") { e.preventDefault(); goUp(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); goDown(); }
    else if (e.key === "Escape") { selecting = false; document.body.style.cursor = ""; marker.style.display = "none"; btnSel.textContent = "Select element"; }
  }, true);

  // Reposition the box on scroll/resize so it stays attached to the selected
  // element (in case of sticky/fixed positioning or layout reflow).
  let raf = 0;
  const reRender = () => { if (chosen && !selecting) highlight(chosen); };
  window.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(reRender); }, true);
  window.addEventListener("resize", reRender);

  // -- Panel --
  const panel = $("div");
  Object.assign(panel.style, {
    position: "fixed", zIndex: 2147483647, left: "16px", bottom: "16px", width: "330px",
    display: "flex", flexDirection: "column", gap: "8px",
    background: "#0E1223", color: "#F5F7FA", border: "1px solid #263048", borderRadius: "12px",
    padding: "14px", font: "14px/1.4 system-ui, sans-serif", boxShadow: "0 12px 40px rgba(0,0,0,.5)",
  });

  const title = $("div", { textContent: "Annotate for AI" });
  Object.assign(title.style, { fontWeight: "700", color: "#FFC20E", display: "flex", justifyContent: "space-between", alignItems: "center" });
  const closeBtn = $("span", { textContent: "x", title: "Close" });
  Object.assign(closeBtn.style, { cursor: "pointer", opacity: ".7" });
  closeBtn.onclick = () => { panel.style.display = "none"; marker.style.display = "none"; };
  title.appendChild(closeBtn);

  const btnSel = $("button", { textContent: "Select element" });
  const info = $("div");
  info.textContent = "No element selected";
  Object.assign(info.style, { fontSize: "12px", color: "#A9B4C7", minHeight: "16px" });

  // Navigate the hierarchy at the selected point.
  const nav = $("div");
  Object.assign(nav.style, { display: "flex", gap: "6px" });
  const btnUp = $("button", { textContent: "Up (parent)", disabled: true });
  const btnDown = $("button", { textContent: "Down (child)", disabled: true });
  btnUp.onclick = goUp; btnDown.onclick = goDown;
  nav.append(btnUp, btnDown);

  // List of annotations made so far. Click a row to load it back for editing.
  const list = $("div");
  Object.assign(list.style, {
    display: "none", flexDirection: "column", gap: "4px",
    maxHeight: "110px", overflowY: "auto", fontSize: "12px",
  });

  const comment = $("textarea", { placeholder: "Comment for the AI...", rows: 3 });
  const btnAdd = $("button", { textContent: "Add annotation" });
  const btnCancelEdit = $("button", { textContent: "Cancel edit" });
  btnCancelEdit.style.display = "none";
  const counter = $("div", { textContent: "0 annotations" });
  Object.assign(counter.style, { fontSize: "12px", color: "#A9B4C7" });
  const btnCopy = $("button", { textContent: "Copy all for AI" });

  for (const b of [btnSel, btnAdd, btnCancelEdit, btnCopy, btnUp, btnDown]) {
    Object.assign(b.style, { padding: "9px 12px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "700", fontFamily: "inherit" });
  }
  btnSel.style.background = "#1B2236"; btnSel.style.color = "#F5F7FA";
  for (const b of [btnUp, btnDown]) { b.style.background = "#1B2236"; b.style.color = "#F5F7FA"; b.style.flex = "1"; }
  btnAdd.style.background = "#FFC20E"; btnAdd.style.color = "#0B0D14";
  btnCancelEdit.style.background = "#1B2236"; btnCancelEdit.style.color = "#F5F7FA";
  btnCopy.style.background = "#25D366"; btnCopy.style.color = "#06281a";
  Object.assign(comment.style, { width: "100%", boxSizing: "border-box", background: "#07090F", color: "#F5F7FA", border: "1px solid #3A4766", borderRadius: "8px", padding: "8px", font: "inherit", resize: "vertical" });

  panel.append(title, btnSel, info, nav, list, comment, btnAdd, btnCancelEdit, counter, btnCopy);
  document.body.appendChild(panel);

  btnSel.onclick = () => {
    selecting = !selecting;
    btnSel.textContent = selecting ? "Cancel (click an element)" : "Select element";
    document.body.style.cursor = selecting ? "crosshair" : "";
    if (!selecting) marker.style.display = "none";
  };

  function renderList() {
    list.style.display = annotations.length ? "flex" : "none";
    list.innerHTML = "";
    for (const a of annotations) {
      const row = $("div", { textContent: `#${a.id} [${a.tag}] ${a.comment.slice(0, 40)}` });
      Object.assign(row.style, {
        cursor: "pointer", padding: "4px 6px", borderRadius: "6px",
        background: a.id === editingId ? "#2A3350" : "#161B2C",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      });
      row.onclick = () => startEdit(a.id);
      list.appendChild(row);
    }
  }

  function startEdit(id) {
    const a = annotations.find((x) => x.id === id);
    if (!a) return;
    editingId = id;
    comment.value = a.comment;
    comment.focus();
    btnAdd.textContent = `Update annotation #${id}`;
    btnCancelEdit.style.display = "";
    // Best-effort: re-highlight the original element if its selector still
    // matches something on the page (harmless if not).
    try {
      const el = document.querySelector(a.selector);
      if (el) { chosen = el; stack = [el]; level = 0; highlight(el); }
    } catch {}
    renderList();
  }

  function stopEdit() {
    editingId = null;
    btnAdd.textContent = "Add annotation";
    btnCancelEdit.style.display = "none";
    renderList();
  }

  btnCancelEdit.onclick = () => {
    comment.value = "";
    stopEdit();
  };

  function markdown() {
    return annotations.map((a) =>
      "## Annotation " + a.id + "\n" +
      "**Comment:** " + a.comment + "\n" +
      "**Selector:** `" + a.selector + "`\n" +
      "**Element:** `" + a.tag + "` (" + a.w + "x" + a.h + ")\n" +
      (a.screenshot ? "**Screenshot:** " + a.screenshot + "\n" : "") +
      "**Styles:** " + a.styles + "\n\n" +
      "```html\n" + a.html + "\n```"
    ).join("\n\n---\n\n");
  }

  btnAdd.onclick = () => {
    const c = comment.value.trim();
    if (!c) { comment.focus(); return; }

    if (editingId !== null) {
      const a = annotations.find((x) => x.id === editingId);
      if (!a) { stopEdit(); return; }
      a.comment = c;
      // If a (possibly different) element was picked while editing, refresh
      // the element-derived fields too; otherwise only the comment changes.
      if (chosen) {
        const r = chosen.getBoundingClientRect();
        Object.assign(a, {
          selector: cssPath(chosen), tag: desc(chosen),
          w: Math.round(r.width), h: Math.round(r.height),
          styles: styles(chosen), html: (chosen.outerHTML || "").slice(0, 600), url: location.href,
          rect: { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height },
        });
      }
      if (window.sendAnnotation) window.sendAnnotation(JSON.stringify({ ...a, action: "update" }));
      stopEdit();
    } else {
      if (!chosen) { info.textContent = "Select an element first"; return; }
      const r = chosen.getBoundingClientRect();
      const a = {
        id: nextId++,
        comment: c, selector: cssPath(chosen), tag: desc(chosen),
        w: Math.round(r.width), h: Math.round(r.height),
        styles: styles(chosen), html: (chosen.outerHTML || "").slice(0, 600), url: location.href,
        rect: { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height },
      };
      annotations.push(a);
      if (window.sendAnnotation) window.sendAnnotation(JSON.stringify({ ...a, action: "add" }));
    }

    comment.value = ""; stack = []; level = 0; chosen = null; marker.style.display = "none";
    info.textContent = "No element selected"; btnUp.disabled = btnDown.disabled = true;
    counter.textContent = annotations.length + " annotation" + (annotations.length === 1 ? "" : "s");
    renderList();
  };

  btnCopy.onclick = async () => {
    if (!annotations.length) { btnCopy.textContent = "Nothing to copy"; return; }
    try { await navigator.clipboard.writeText(markdown()); btnCopy.textContent = "Copied"; }
    catch { btnCopy.textContent = "Copy manually from the terminal"; }
    setTimeout(() => (btnCopy.textContent = "Copy all for AI"), 1600);
  };

  window.__anota = { panel, annotations, markdown, highlight };
  console.log("[anota] overlay active, click an element and use Up/Down or arrow keys to navigate parents/children. Click a row in the list to edit it.");
})();
