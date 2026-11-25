import {documentIdentity} from './note-version.mjs';
import {sectionWorldPosition} from './original-sections.mjs';

function capture(graph, ids) {
  const instances = ids.map(id => graph.instances.find(row => row.id === id));
  const endpoints = new Set(ids);
  const edges = [];
  let added;
  do {
    added = false;
    for (const edge of graph.connections || []) {
      if (endpoints.has(edge.id) || (!endpoints.has(edge.beginId) && !endpoints.has(edge.endId))) continue;
      edges.push(edge);
      endpoints.add(edge.id);
      added = true;
    }
  } while (added);
  return {instances, edges: edges.sort((a, b) => a.id.localeCompare(b.id))};
}

export function prepareCardMove(graph, {source, ids}, target, point) {
  if (!graph.boards.some(board => board.id === target && !board.attributes?.isTrashed)) throw Error('目標白板不存在');
  const before = capture(graph, ids);
  const activeNotes = new Set(graph.contents.filter(row => row.kind === 'text').map(row => row.id));
  for (const card of graph.cardMetadata || []) if (card.isTrashed) activeNotes.delete(card.id);
  if (before.instances.some(row => row?.boardId !== source || !activeNotes.has(row.contentId))) throw Error('原白板的卡片已變更，請重新剪下');

  const groups = new Map((graph.sections || []).filter(row => row.whiteboardId === source).map(row => [row.id, row]));
  const origins = before.instances.map(row => {
    const parent = row.attributes?.parentId;
    const offset = sectionWorldPosition(groups.has(parent) ? parent : '', groups);
    return {x: row.x + offset.x, y: row.y + offset.y};
  });
  const left = Math.min(...origins.map(p => p.x)), top = Math.min(...origins.map(p => p.y));
  let z = Math.max(0, ...graph.instances.filter(row => row.boardId === target).map(row => row.z));
  const instances = before.instances.map((row, i) => {
    const next = {...row, boardId: target, x: point.x + origins[i].x - left, y: point.y + origins[i].y - top, z: ++z};
    if (row.attributes) {
      next.attributes = {...row.attributes};
      if ('parentId' in next.attributes) next.attributes.parentId = '';
      if ('whiteboardId' in next.attributes) next.attributes.whiteboardId = target;
    }
    return next;
  });
  const kept = new Set(ids), edges = [];
  if (source === target) edges.push(...before.edges);
  else {
    let count;
    do {
      count = edges.length;
      for (const edge of before.edges) {
        if (kept.has(edge.id) || !kept.has(edge.beginId) || !kept.has(edge.endId)) continue;
        kept.add(edge.id);
        edges.push({...edge, whiteboardId: target});
      }
    } while (edges.length !== count);
  }
  return {workspaceId: graph.workspaceId, ids, before, after: {instances, edges: edges.sort((a, b) => a.id.localeCompare(b.id))}};
}

export function cardMoveOperations(graph, move, undo = false) {
  const from = undo ? move.after : move.before, to = undo ? move.before : move.after;
  if (graph.workspaceId !== move.workspaceId || documentIdentity(capture(graph, move.ids)) !== documentIdentity(from)) {
    throw Error('卡片位置或連線已變更，無法套用此操作');
  }
  for (const row of to.instances) {
    if (!graph.boards.some(board => board.id === row.boardId && !board.attributes?.isTrashed)) throw Error('白板已移至回收站');
    const parent = row.attributes?.parentId;
    if (parent && !graph.sections?.some(group => group.id === parent && group.whiteboardId === row.boardId)) throw Error('卡片原屬群組已變更');
  }
  const affected = new Set(from.edges.map(edge => edge.id));
  const ops = from.edges.map(edge => ({type:'deleteCatalog',kind:'connection',id:edge.id}));
  for (const {attributes, ...data} of to.instances) {
    ops.push({type:'putInstance',data});
    if (attributes) ops.push({type:'putCatalog',kind:'instance',data:{...attributes,id:data.id}});
  }
  const available = new Set([
    ...graph.instances.map(row => row.id),
    ...(graph.connections || []).filter(edge => !affected.has(edge.id)).map(edge => edge.id),
  ]);
  const remaining = new Map(to.edges.map(edge => [edge.id, edge]));
  while (remaining.size) {
    const size = remaining.size;
    for (const edge of remaining.values()) {
      if (!available.has(edge.beginId) || !available.has(edge.endId)) continue;
      ops.push({type:'putCatalog',kind:'connection',data:edge});
      remaining.delete(edge.id);
      available.add(edge.id);
    }
    if (remaining.size === size) throw Error('卡片原有連線的端點已變更');
  }
  return ops;
}
