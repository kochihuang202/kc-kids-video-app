import { noteRecord, attachmentRecord } from './original-catalog.mjs';
// Original background pt/ht getCardLinks contracts. Connections reference
// placement IDs; mention/embed-card references point at content IDs.
export function cardLinks(graph, cardId) {
    const content = graph.contents.find(row => row.id === cardId), record = row => row.kind === 'text' ? noteRecord(graph, row) : attachmentRecord(graph, row), placements = graph.instances.filter(row => row.contentId === cardId), ids = new Set(placements.map(row => row.id)), groups = new Map();
    const target = id => { const instance = graph.instances.find(row => row.id === id), object = instance && graph.contents.find(row => row.id === instance.contentId); if (!object)
        return null; const card = record(object); if (card.isTrashed)
        return null; return { ...instance.attributes, ...instance, id: instance.id, objectId: instance.contentId, whiteboardId: instance.boardId, [object.kind === 'text' ? 'noteCard' : object.kind === 'pdf' ? 'pdfCard' : 'mediaCard']: card }; };
    for (const edge of graph.connections || []) {
        const board = graph.boards.find(row => row.id === edge.whiteboardId && !row.attributes?.isTrashed);
        if (!board)
            continue;
        for (const [side, endpoint, type] of [[ids.has(edge.beginId) ? 'sourceList' : null, edge.endId, edge.endObjectType], [ids.has(edge.endId) ? 'targetList' : null, edge.beginId, edge.beginObjectType]]) {
            if (!side)
                continue;
            const object = target(endpoint);
            if (!object)
                continue;
            if (!groups.has(board.id))
                groups.set(board.id, { whiteboardId: board.id, whiteboardName: board.title, sourceList: [], targetList: [], groupList: [] });
            groups.get(board.id)[side].push({ whiteboardId: board.id, whiteboardName: board.title, targetObjectId: endpoint, targetObjectType: type, targetObject: object });
        }
    }
    // Original getCardLinks also exposes membership in a containing section.
    for(const item of placements){const section=graph.sections?.find(row=>row.id===item.attributes?.parentId),board=section&&graph.boards.find(row=>row.id===item.boardId&&!row.attributes?.isTrashed);if(!section||!board)continue;if(!groups.has(board.id))groups.set(board.id,{whiteboardId:board.id,whiteboardName:board.title,sourceList:[],targetList:[],groupList:[]});const list=groups.get(board.id).groupList;if(!list.some(row=>row.id===section.id))list.push({id:section.id,groupName:section.title||'',whiteboardId:board.id});}
    const scan = (node, out) => { if (!node || typeof node !== 'object')
        return; if ((node.type === 'mention' || node.type === 'embed-card') && node.objectId === cardId)
        out.push(node); for (const child of node.children || [])
        scan(child, out); const caption=node.caption;if(caption&&typeof caption==='object')scan(caption.editorState?.root||caption.root,out); };
    const linksInNoteCards = [];
    for (const row of graph.contents.filter(row => row.kind === 'text')) {
        const note = noteRecord(graph, row);
        if (note.isTrashed)
            continue;
        const links = [];
        scan(row.document?.root, links);
        if (links.length)
            linksInNoteCards.push({ noteCard: note, links });
    }
    const section=graph.sections?.find(row=>row.id===cardId),board=graph.boards.find(row=>row.id===cardId),file=graph.files?.find(row=>row.id===cardId);
    const selfCard = content ? record(content) : section ? {...section,type:'NodeGroup'} : board ? {...board.attributes,id:board.id,name:board.title,type:'Whiteboard'} : file ? {...file,type:'File'} : null;
    return { success: true, whiteboardLinks: [...groups.values()], linksInNoteCards, linksInDailyNotes: [], linksInMindmaps: [], linksInPdfHighlights: [], linksInVideoHighlights: [], linksInWebsiteCards: [], linksInNoteHighlights: [], linksInRelations: [], mindmapIdList: [], appearInMindmaps: [], selfCard, fileRecord: file || graph.files?.find(file => file.id === selfCard?.fileId) || null };
}
export function createOriginalConnections({ r, navigate, coordinator, load, store, catalogOperation, getBoardId }) {
    const rows = new Map(), names = new Set(['addConnection', 'updateConnection', 'deleteConnection', 'getConnectionsByWhiteboardId', 'getCardLinks']);
    const put = row => coordinator.stage(catalogOperation('connection', row));
    const hydrate = graph => { rows.clear(); for (const row of graph.connections || [])
        rows.set(row.id, row); store.getState().setConnections([...store.getState().connections.filter(row=>String(row.id).startsWith('mindmap-conn-')),...[...rows.values()].filter(row => row.whiteboardId === getBoardId()).map(row => r(19281).YH.connectionToFlowConnection(row))]); };
    const call = (name, payload) => navigate(async () => {
        await coordinator.flush();
        const graph = await load();
        if (name === 'getCardLinks')
            return cardLinks(graph, typeof payload === 'string' ? payload : payload.cardId || payload.objectId);
        if (name === 'getConnectionsByWhiteboardId')
            return { data: (graph.connections || []).filter(row => row.whiteboardId === (typeof payload === 'string' ? payload : payload.whiteboardId)) };
        if (name === 'deleteConnection') {
            const id = typeof payload === 'string' ? payload : payload.id;
            coordinator.stage({ type: 'deleteCatalog', kind: 'connection', id });
        }
        else {
            const previous = (graph.connections || []).find(row => row.id === payload.id), row = name === 'addConnection' ? payload : { ...previous, ...payload.connection, id: payload.id };
            if (!row.id || !row.whiteboardId || ![row.beginId, row.endId].every(id => graph.instances.some(instance => instance.id === id && instance.boardId === row.whiteboardId) || (graph.connections || []).some(edge => edge.id === id && edge.whiteboardId === row.whiteboardId)))
                throw Error('Connection endpoint missing');
            put(row);
        }
        await coordinator.flush();
        hydrate(await load());
        return { success: true };
    });
    function changed(connections) { for (const item of connections) {
        const old = rows.get(item.id);
        if (!old)
            continue;
        const row = { ...old, ...r(19281).YH.flowConnectionToDBUpdate(item, getBoardId()) };
        rows.set(row.id, row);
        put(row);
    } }
    function connect(event) { if (!event.flowConnection)
        return; const row = r(19281).YH.flowConnectionToDBUpdate(event.flowConnection, getBoardId()), nodes = store.getState().nodes; row.beginObjectType = nodes.find(node => node.id === row.beginId)?.type || 'Connection'; row.endObjectType = nodes.find(node => node.id === row.endId)?.type || 'Connection'; return call('addConnection', row); }
    function updateEdge(id, updates) { const current = store.getState().connections.find(row => row.id === id); if (!current)
        return; const edge = r(19281).YH.flowConnectionToEdge(current), next = { ...edge, ...updates, data: { ...edge.data, ...updates.data } }, nodes = store.getState().nodes, record = r(19281).YH.edgeToConnection(next, getBoardId(), nodes.find(node => node.id === next.source)?.type, nodes.find(node => node.id === next.target)?.type); return call('updateConnection', { id, connection: record }); }
    return { has: name => names.has(name), call, hydrate, connect, changed, updateEdge, edges: () => store.getState().connections.map(row => r(19281).YH.flowConnectionToEdge(row)) };
}
