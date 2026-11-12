// Own SQLite boundary for the original video card (80716/59771), video page (81072)
// and video highlight panel (79719). Playback, capture and panel UI stay original.
// A local video is referenced by path only; its bytes never enter the attachment
// store, snapshots or shares. Highlights and their screenshots are InkBridge data.
export const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg', 'mkv', 'avi', 'wmv', 'flv', 'mpg', 'mpeg'];
export function videoRecord(graph, content) {
    const meta = graph.cardMetadata?.find(row => row.id === content.id) || {};
    return { createdTime: null, lastEditedTime: null, isTrashed: false, propertiesConfig: [], link: '', cover: '', ...meta, id: content.id, title: content.title, type: 'video' };
}
export function createOriginalVideo({ navigate, coordinator, load, contents, putContent, catalogOperation, refreshNodes, saveImages, registerFiles, copyImage }) {
    const names = new Set(['addVideoHighlight', 'updateVideoHighlight', 'getVideoHighlightsBySourceId', 'updateMediaCard', 'updateVideoCover', 'saveVideoScreenshot', 'copyImageToClipboard', 'getVideoPositionSeconds', 'updateVideoPositionSeconds']);
    // The original player (59771) resumes each file where it stopped. That is a per-device
    // viewing position, not workspace content: keep it out of SQLite revisions and snapshots.
    const positionKey = fileId => 'inkbridge-video-position:' + String(fileId || '');
    const put = (kind, data) => coordinator.stage(catalogOperation(kind, data));
    const cardBySource = (graph, sourceId) => { const content = graph.contents.find(row => row.kind === 'video' && (row.id === sourceId || graph.cardMetadata?.some(meta => meta.id === row.id && meta.fileId === sourceId))); return content ? videoRecord(graph, content) : null; };
    const highlight = (graph, id) => (graph.videoHighlights || []).find(row => row.id === id);
    // The original list reads highlight.fileSuffix for its screenshot gallery URL.
    const present = row => ({ ...row, notes: typeof row.notes === 'string' ? JSON.parse(row.notes) : row.notes });
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
                return { success: true, data: present(row) };
            }
            if (name === 'batchDeleteCardsByType') {
                const rows = payload.map(target => highlight(graph, target.objectId));
                if (rows.some(row => !row)) throw Error('Video highlight missing');
                const now = new Date().toISOString();
                // Soft delete, as the original trash model; screenshots stay in the store.
                for (const row of rows) put('video-highlight', { ...row, isTrashed: true, lastEditedTime: now });
                await coordinator.flush();
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
    return { has, call };
}
