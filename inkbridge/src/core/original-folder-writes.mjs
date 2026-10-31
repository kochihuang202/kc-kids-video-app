// Data boundary for original 58476 -> deleteWhiteboardFolder (885255).
// Keep card data and board instances; only the folder itself is removed.
export function folderDeletionOperations(graph, id, now) {
  if (!(graph.folders || []).some(folder => folder.id === id)) throw Error('分組不存在');
  const references = (graph.whiteboardInstances || []).filter(ref => ref.containerId === id);
  const boardIds = new Set(references.map(ref => ref.whiteboardId));
  return [
    {type: 'deleteCatalog', kind: 'folder', id},
    ...references.map(ref => ({type: 'putCatalog', kind: 'whiteboard-instance', data: {...ref, isTrashed: true, lastEditedTime: now}})),
    ...graph.boards.filter(board => boardIds.has(board.id)).map(board => ({type: 'putBoard', data: {...board, attributes: {...board.attributes, isTrashed: true, lastEditedTime: now}}})),
  ];
}
