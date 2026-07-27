// Extension service worker. Does nothing on its own: exposes helpers that
// Claude calls via CDP (Runtime.evaluate in this context) to group tabs into
// a dedicated group. Only the extensions API can touch chrome.tabGroups.

// Opens urls in new tabs and puts them all into a group with a name/color.
globalThis.openInGroup = async (urls, title = "Claude", color = "yellow", collapsed = false) => {
  const tabs = [];
  for (const u of urls) tabs.push(await chrome.tabs.create({ url: u, active: false }));
  const groupId = await chrome.tabs.group({ tabIds: tabs.map((t) => t.id) });
  await chrome.tabGroups.update(groupId, { title, color, collapsed });
  return { groupId, tabIds: tabs.map((t) => t.id) };
};

// Puts already-existing tabs (by id) into a group (creates the group if none is given).
globalThis.groupTabs = async (tabIds, title = "Claude", color = "yellow", groupId) => {
  const gid = await chrome.tabs.group(groupId ? { tabIds, groupId } : { tabIds });
  await chrome.tabGroups.update(gid, { title, color });
  return gid;
};

// Returns the "Claude" group if it exists (to reuse it).
globalThis.findGroup = async (title = "Claude") => {
  const gs = await chrome.tabGroups.query({ title });
  return gs[0] || null;
};

// Status: current groups + tabs per group (for verification).
globalThis.groupsStatus = async () => {
  const groups = await chrome.tabGroups.query({});
  const out = [];
  for (const g of groups) {
    const tabs = await chrome.tabs.query({ groupId: g.id });
    out.push({ id: g.id, title: g.title, color: g.color, collapsed: g.collapsed, tabs: tabs.map((t) => t.title) });
  }
  return out;
};
