// Service worker de la extensión. No hace nada por sí solo: expone helpers que
// Claude invoca por CDP (Runtime.evaluate en este contexto) para agrupar pestañas
// en un grupo propio. Solo la API de extensiones puede tocar chrome.tabGroups.

// Abre urls en pestañas nuevas y las mete todas en un grupo con nombre/color.
globalThis.abrirEnGrupo = async (urls, titulo = "Claude", color = "yellow", collapsed = false) => {
  const tabs = [];
  for (const u of urls) tabs.push(await chrome.tabs.create({ url: u, active: false }));
  const groupId = await chrome.tabs.group({ tabIds: tabs.map((t) => t.id) });
  await chrome.tabGroups.update(groupId, { title: titulo, color, collapsed });
  return { groupId, tabIds: tabs.map((t) => t.id) };
};

// Mete pestañas ya existentes (por id) en un grupo (crea el grupo si no se pasa).
globalThis.agrupar = async (tabIds, titulo = "Claude", color = "yellow", groupId) => {
  const gid = await chrome.tabs.group(groupId ? { tabIds, groupId } : { tabIds });
  await chrome.tabGroups.update(gid, { title: titulo, color });
  return gid;
};

// Devuelve el grupo "Claude" si existe (para reutilizarlo).
globalThis.buscarGrupo = async (titulo = "Claude") => {
  const gs = await chrome.tabGroups.query({ title: titulo });
  return gs[0] || null;
};

// Estado: grupos actuales + pestañas por grupo (para verificar).
globalThis.estadoGrupos = async () => {
  const grupos = await chrome.tabGroups.query({});
  const out = [];
  for (const g of grupos) {
    const tabs = await chrome.tabs.query({ groupId: g.id });
    out.push({ id: g.id, titulo: g.title, color: g.color, collapsed: g.collapsed, pestanas: tabs.map((t) => t.title) });
  }
  return out;
};
