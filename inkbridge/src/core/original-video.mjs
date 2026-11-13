// Own SQLite boundary for the original video card (80716/59771), video page (81072)
// and video highlight panel (79719). Playback, capture and panel UI stay original.
// A local video is referenced by path only; its bytes never enter the attachment
// store, snapshots or shares. Highlights and their screenshots are InkBridge data.
export const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg', 'mkv', 'avi', 'wmv', 'flv', 'mpg', 'mpeg'];
export function videoRecord(graph, content) {
    const meta = graph.cardMetadata?.find(row => row.id === content.id) || {};
    return { createdTime: null, lastEditedTime: null, isTrashed: false, propertiesConfig: [], link: '', cover: '', ...meta, id: content.id, title: content.title, type: 'video' };
}
// Whiteboard placements of a highlight (original 94700.KT, 44321 menu, 10764 VideoHighlight
// node) are 'video-highlight-instance' catalog rows. A card shows the same highlight, never
// a copy; removing a placement keeps the highlight.
const placementNames = new Set(['addVideoHighlightInstance', 'batchCreateVideoHighlightInstances', 'batchUpdateVideoHighlightInstances', 'batchDeleteVideoHighlightInstances']);
export function createOriginalVideo({ navigate, coordinator, load, contents, putContent, catalogOperation, refreshNodes, saveImages, registerFiles, copyImage, r, store, getBoardId, graph }) {
    const names = new Set(['addVideoHighlight', 'updateVideoHighlight', 'getVideoHighlightsBySourceId', 'getVideoHighlight', 'getVideoList', 'updateMediaCard', 'updateVideoCover', 'saveVideoScreenshot', 'copyImageToClipboard', 'getVideoPositionSeconds', 'updateVideoPositionSeconds', ...placementNames]);
    const placements = new Map(), highlightRows = new Map(), videoCards = new Map();
    const sourceCard = row => [...videoCards.values()].find(card => card.fileId === row.sourceId) || null;
    function replace(next) {
        placements.clear(); highlightRows.clear(); videoCards.clear();
        for (const row of next.videoHighlightInstances || []) placements.set(row.id, { ...row });
        for (const row of next.videoHighlights || []) highlightRows.set(row.id, present(row));
        for (const content of next.contents || []) if (content.kind === 'video') videoCards.set(content.id, videoRecord(next, content));
    }
    function toNode(placement) {
        const row = highlightRows.get(placement.objectId);
        if (!row || row.isTrashed) return null;
        const node = r(19281).YH.videoHighlightInstanceToNode(placement, row);
        node.data.videoCard = sourceCard(row);
        return node;
    }
    // Same order as the original placement: highlights and their video cards enter the
    // flow store before the nodes that read them.
    function hydrate() {
        if (!store || !r) return;
        const board = getBoardId(), list = [...placements.values()].filter(row => row.whiteboardId === board).map(toNode).filter(Boolean), redux = r(63268).Z;
        if (list.length) redux.dispatch(r(6104).F0(list.map(node => node.data.highlight)));
        const cardsInUse = [...new Set(list.map(node => node.data.videoCard).filter(Boolean))];
        if (cardsInUse.length) redux.dispatch(r(23407).Gk({ mediaCards: cardsInUse, noteCards: [], mindmaps: [], pdfCards: [] }));
        const state = store.getState();
        state.setNodes([...state.nodes.filter(node => node.type !== 'VideoHighlight'), ...list]);
        r(66597).L.clearCache(); r(66597).L.requestRender();
    }
    // A highlight edited elsewhere (panel, record page) updates its cards in place, so an
    // open card editor is not remounted.
    function refreshHighlight(row) {
        highlightRows.set(row.id, row);
        if (!store) return;
        store.getState().setNodes(nodes => nodes.map(node => node.type === 'VideoHighlight' && node.data?.objectId === row.id ? { ...node, data: { ...node.data, highlight: row } } : node));
        r(66597).L.clearCache(); r(66597).L.requestRender();
    }
    function attachCards(pending, tries = 40) {
        if (!store || !pending.size) return;
        const ids = new Set(store.getState().nodes.filter(node => pending.has(node.id)).map(node => node.id));
        if (ids.size) store.getState().setNodes(nodes => nodes.map(node => ids.has(node.id) ? { ...node, data: { ...node.data, videoCard: node.data?.videoCard || pending.get(node.id) } } : node));
        for (const id of ids) pending.delete(id);
        if (pending.size && tries > 0) setTimeout(() => attachCards(pending, tries - 1), 50);
    }
    // The original player (59771) resumes each file where it stopped. That is a per-device
    // viewing position, not workspace content: keep it out of SQLite revisions and snapshots.
    const positionKey = fileId => 'inkbridge-video-position:' + String(fileId || '');
    const put = (kind, data) => coordinator.stage(catalogOperation(kind, data));
    const cardBySource = (graph, sourceId) => { const content = graph.contents.find(row => row.kind === 'video' && (row.id === sourceId || graph.cardMetadata?.some(meta => meta.id === row.id && meta.fileId === sourceId))); return content ? videoRecord(graph, content) : null; };
    const highlight = (graph, id) => (graph.videoHighlights || []).find(row => row.id === id);
    // The original list reads highlight.fileSuffix for its screenshot gallery URL.
    const present = row => ({ ...row, notes: typeof row.notes === 'string' ? JSON.parse(row.notes) : row.notes });
    if (graph) replace(graph);
    const has = (name, payload) => names.has(name) || name === 'batchDeleteCardsByType' && Array.isArray(payload) && payload.length > 0 && payload.every(row => row?.objectType === 'VideoHighlight');
    const call = (name, payload) => {
        // Capture and clipboard do not touch the workspace revision order.
        if (name === 'copyImageToClipboard') return copyImage(payload);
        if (name === 'getVideoPositionSeconds') { const value = Number(localStorage.getItem(positionKey(payload?.fileId))); return Promise.resolve({ success: true, positionSeconds: Number.isFinite(value) && value > 0 ? value : 0 }); }
        if (name === 'updateVideoPositionSeconds') { const value = Number(payload?.positionSeconds); if (payload?.fileId && Number.isFinite(value) && value >= 0) localStorage.setItem(positionKey(payload.fileId), String(value)); return Promise.resolve({ success: true }); }
        if (name === 'saveVideoScreenshot') return (async () => {
            if (typeof payload?.base64Image !== 'string') throw Error('Invalid video screenshot');
            const [saved] = await saveImages({ items: [{ base64Image: payload.base64Image, fileName: String(payload.fileName || 'video-screenshot.png') }] });
            await registerFiles([saved.fileRecord]);
            return { success: true, fileId: saved.fileId, fileSuffix: saved.type, currentTime: payload.currentTime };
        })();
        return navigate(async () => {
            await coordinator.flush();
            const graph = await load();
            if (name === 'getVideoList') return { success: true, videoList: graph.contents.filter(row => row.kind === 'video').map(row => videoRecord(graph, row)).filter(row => !row.isTrashed), videoHighlights: (graph.videoHighlights || []).filter(row => !row.isTrashed).map(present) };
            if (name === 'getVideoHighlight') {
                const id = typeof payload === 'string' ? payload : payload?.id, row = highlight(graph, id);
                if (!row) throw Error('Video highlight missing');
                return { ...present(row), videoCard: cardBySource(graph, row.sourceId) };
            }
            if (name === 'batchDeleteVideoHighlightInstances') {
                const ids = (Array.isArray(payload) ? payload : [payload]).map(item => typeof item === 'string' ? item : item?.id);
                if (ids.some(id => !id)) throw Error('Video highlight placement missing');
                for (const id of ids) { placements.delete(id); coordinator.stage({ type: 'deleteCatalog', kind: 'video-highlight-instance', id }); }
                await coordinator.flush();
                // Keyboard deletion reaches here through the original 94700 batch delete; the
                // host canvas does not drop this node type by itself.
                if (store) { store.getState().setNodes(nodes => nodes.filter(node => !ids.includes(node.id))); r(66597).L.clearCache(); r(66597).L.requestRender(); }
                return { success: true };
            }
            if (name === 'batchUpdateVideoHighlightInstances') {
                const list = Array.isArray(payload) ? payload : [payload];
                if (list.some(item => !placements.has(item?.id))) throw Error('Video highlight placement missing');
                for (const item of list) { const next = { ...placements.get(item.id), ...(item.updates || {}), id: item.id }; placements.set(item.id, next); put('video-highlight-instance', next); }
                await coordinator.flush();
                return { success: true };
            }
            if (name === 'addVideoHighlightInstance' || name === 'batchCreateVideoHighlightInstances') {
                const list = Array.isArray(payload) ? payload : [payload];
                if (list.some(item => !item?.id || !highlight(graph, item.objectId) || highlight(graph, item.objectId).isTrashed)) throw Error('Video highlight missing');
                for (const item of list) { placements.set(item.id, { ...item }); put('video-highlight-instance', item); }
                await coordinator.flush();
                for (const item of list) { const row = highlight(graph, item.objectId); highlightRows.set(row.id, present(row)); }
                // The original adds the node after this call returns; then give it its source video
                // card (header title and the 📍 / openPdf target).
                attachCards(new Map(list.map(item => [item.id, cardBySource(graph, highlight(graph, item.objectId).sourceId)])));
                return { success: true, data: list };
            }
            if (name === 'getVideoHighlightsBySourceId') {
                const sourceId = typeof payload === 'string' ? payload : payload?.sourceId;
                return { success: true, list: (graph.videoHighlights || []).filter(row => row.sourceId === sourceId && !row.isTrashed).map(present), videoCard: cardBySource(graph, sourceId) };
            }
            if (name === 'addVideoHighlight') {
                if (!payload?.id || highlight(graph, payload.id)) throw Error('Video highlight ID already exists');
                if (!cardBySource(graph, payload.sourceId)) throw Error('Video card missing');
                if (!Number.isFinite(payload.timeStamp) || payload.timeStamp < 0) throw Error('Invalid video highlight time');
                const row = { ...payload, isTrashed: false };
                put('video-highlight', row);
                await coordinator.flush();
                highlightRows.set(row.id, present(row));
                return { success: true, data: present(row) };
            }
            if (name === 'updateVideoHighlight') {
                const { id, ...updates } = payload || {}, previous = highlight(graph, id);
                if (!previous || previous.isTrashed) throw Error('Video highlight missing');
                if (updates.timeStamp !== undefined && (!Number.isFinite(updates.timeStamp) || updates.timeStamp < 0)) throw Error('Invalid video highlight time');
                delete updates.sourceId;
                if (Object.entries(updates).every(([key, value]) => JSON.stringify(previous[key]) === JSON.stringify(value))) return { success: true, data: present(previous) };
                const row = { ...previous, ...updates, lastEditedTime: new Date().toISOString() };
                put('video-highlight', row);
                await coordinator.flush();
                refreshHighlight(present(row));
                return { success: true, data: present(row) };
            }
            if (name === 'batchDeleteCardsByType') {
                const rows = payload.map(target => highlight(graph, target.objectId));
                if (rows.some(row => !row)) throw Error('Video highlight missing');
                const now = new Date().toISOString();
                // Soft delete, as the original trash model; screenshots stay in the store.
                for (const row of rows) put('video-highlight', { ...row, isTrashed: true, lastEditedTime: now });
                await coordinator.flush();
                // Cards of a deleted highlight leave the board; their placements stay stored
                // and come back if the highlight is restored.
                for (const row of rows) highlightRows.set(row.id, { ...present(row), isTrashed: true });
                hydrate();
                return { success: true };
            }
            // updateMediaCard / updateVideoCover
            const id = payload?.id || payload?.objectId, content = graph.contents.find(row => row.id === id && row.kind === 'video');
            if (!content) throw Error('Video card missing');
            const previous = videoRecord(graph, content);
            let updates = name === 'updateVideoCover' ? { cover: payload.cover ?? payload.fileId ?? '' } : { ...(payload.updates || {}) };
            for (const key of ['id', 'type', 'isTrashed', 'createdTime']) delete updates[key];
            updates = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined));
            if (updates.path !== undefined && typeof updates.path !== 'string') throw Error('Invalid video path');
            if (Object.entries(updates).every(([key, value]) => JSON.stringify(previous[key]) === JSON.stringify(value))) return { success: true, mediaCard: previous };
            const card = { ...previous, ...updates, lastEditedTime: new Date().toISOString() };
            const meta = { ...card }; delete meta.title;
            put('card', meta);
            // A linked file's identity follows its path (the player URL is derived from it, and
            // Chromium keeps the failed load of the old URL). Highlights follow in the same commit.
            if (card.fileId !== previous.fileId && previous.fileId) for (const row of graph.videoHighlights || []) if (row.sourceId === previous.fileId) put('video-highlight', { ...row, sourceId: card.fileId });
            if (updates.title !== undefined) putContent({ ...contents.get(id), title: String(updates.title) });
            await coordinator.flush();
            contents.set(id, { ...contents.get(id), ...card, kind: 'video' });
            refreshNodes();
            return { success: true, mediaCard: card };
        });
    };
    return { has, call, hydrate, replace, placements };
}
