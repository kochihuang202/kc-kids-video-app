// Own implementation of the confirmed XMind directional/delete contracts.
// Native dispatch, editing and reveal-in-viewport remain in place.
const childrenOf = node => node?.data?.childNodeIds || node?.data?.childrenIds || [];
const sameId = (node, id) => node.id === id || node.data?.id === id;

export function navigateMindmap(nodes, currentId, direction) {
  const current = nodes.find(node => node.id === currentId);
  if (!current) return currentId;
  const visible = nodes.filter(node => node.type === 'MindmapNode' &&
    node.data?.mindMapId === current.data.mindMapId && node.data?.isVisible !== false);
  const find = id => visible.find(node => sameId(node, id));
  const parent = current.data.isRoot ? null : visible.find(node =>
    childrenOf(node).some(id => sameId(current, id)));
  const children = childrenOf(current).map(find).filter(Boolean);
  const side = current.data.side === 'left' ? 'left' : 'right';
  let candidate;
  if (direction === 'left' || direction === 'right') {
    if (current.data.isRoot) candidate = children.find(node => (node.data.side || 'right') === direction);
    else if (direction === side) candidate = children[0];
    else candidate = parent;
  } else if (parent) {
    const siblings = childrenOf(parent).map(find).filter(node => node &&
      (!parent.data.isRoot || (node.data.side || 'right') === side));
    candidate = siblings[siblings.indexOf(current) + (direction === 'up' ? -1 : 1)];
  }
  if (candidate) return candidate.id;
  // Structural rules precede aligned geometric candidates, within this map.
  const rect = node => ({x: node.position.x + node.width / 2,
    y: node.position.y + node.height / 2, width: node.width, height: node.height});
  const origin = rect(current), vertical = direction === 'up' || direction === 'down';
  const axis = vertical ? 'y' : 'x', cross = vertical ? 'x' : 'y';
  const length = vertical ? 'height' : 'width', breadth = vertical ? 'width' : 'height';
  const sign = direction === 'up' || direction === 'left' ? -1 : 1;
  const candidates = visible.filter(node => node !== current).map(node => {
    const bounds = rect(node), distance = (bounds[axis] - origin[axis]) * sign;
    return {node, distance: distance - (bounds[length] + origin[length]) / 2,
      cross: Math.abs(bounds[cross] - origin[cross]), aligned: distance > 0 &&
        Math.abs(bounds[cross] - origin[cross]) <= (bounds[breadth] + origin[breadth]) / 2};
  }).filter(row => row.aligned).sort((a, b) => a.distance - b.distance || a.cross - b.cross);
  return candidates[0]?.node.id || currentId;
}

export function selectionAfterMindmapDelete(rows, removedIds) {
  const removed = new Set(removedIds), byId = new Map(rows.map(row => [row.id, row]));
  const parentOf = new Map();
  for (const row of rows) for (const id of row.childNodeIds || []) parentOf.set(id, row.id);
  function survivor(id, visiting = new Set()) {
    if (!id || visiting.has(id)) return null;
    if (!removed.has(id) && byId.has(id)) return id;
    visiting.add(id);
    const parentId = parentOf.get(id), parent = byId.get(parentId);
    if (!parent) return null;
    const siblings = parent.childNodeIds || [], at = siblings.indexOf(id);
    for (let index = at - 1; index >= 0; index--)
      if (!removed.has(siblings[index])) return siblings[index];
    for (let index = at + 1; index < siblings.length; index++)
      if (!removed.has(siblings[index])) return siblings[index];
    return survivor(parentId, visiting);
  }
  return [...new Set([...removed].filter(id => !removed.has(parentOf.get(id)))
    .map(id => survivor(id)).filter(Boolean))];
}

export function installMindmapKeyboard() {
  globalThis.__inkbridgeMindmapNavigate = navigateMindmap;
}
