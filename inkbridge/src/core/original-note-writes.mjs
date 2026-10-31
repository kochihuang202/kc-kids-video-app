// SQLite/write-boundary adaptation. All creation/selection/layout UI and the
// add-to-whiteboard placement algorithm remain original modules 31167/94700.
export function createOriginalNoteWriter({ navigate, coordinator, load, contents, instances, putContent, acceptContentDocument, catalogOperation, store, toNode, getBoardId }) {
    return (method, payload) => navigate(async () => {
        await coordinator.flush();
        if (method === 'batchInsertCardInstances') {
            if (!Array.isArray(payload.instances) || payload.instances.some(row => row.__type !== 'NoteCard' || !contents.has(row.objectId)))
                throw Error('含有尚未接入的卡片類型，未變更資料');
            const rows = payload.instances.map((row, index) => ({ id: row.id, contentId: row.objectId, boardId: row.whiteboardId, x: row.x, y: row.y, width: row.width || 520, height: row.height || 480, z: instances.size + index }));
            for (let i = 0; i < rows.length; i++) {
                coordinator.stage({ type: 'putInstance', data: rows[i] });
                coordinator.stage(catalogOperation('instance', payload.instances[i]));
            }
            await coordinator.flush();
            for (const row of rows)
                instances.set(row.id, { ...row, attributes: payload.instances.find(native => native.id === row.id) });
            store.getState().setNodes([...instances.values()].filter(row => row.boardId === getBoardId()).map(toNode));
            return { success: true };
        }
        if (method === 'batchDeleteCardsByType' || method === 'restoreNoteCard') {
            const targets = method === 'restoreNoteCard' ? [{ objectId: payload.id, objectType: 'NoteCard' }] : payload;
            if (!Array.isArray(targets) || targets.some(row => row.objectType !== 'NoteCard' || !contents.has(row.objectId)))
                throw Error('這批卡片含有尚未接入的類型，未變更資料');
            const graph = await load(), ids = new Set(targets.map(row => row.objectId));
            for (const id of ids)
                coordinator.stage(catalogOperation('card', { ...(graph.cardMetadata || []).find(row => row.id === id), id, isTrashed: method !== 'restoreNoteCard', lastEditedTime: new Date().toISOString() }));
            const removed = method === 'batchDeleteCardsByType' ? [...instances.values()].filter(row => ids.has(row.contentId)) : [];
            for (const row of removed)
                coordinator.stage({ type: 'deleteInstance', id: row.id });
            await coordinator.flush();
            for (const row of removed)
                instances.delete(row.id);
            if (removed.length)
                store.getState().setNodes(nodes => nodes.filter(node => !ids.has(node.data.objectId)));
            return { success: true };
        }
        if (method === 'addNoteCard') {
            const note = payload.noteCard || payload;
            if (contents.has(note.id))
                throw Error('卡片ID已存在');
            const document = typeof note.content === 'string' ? JSON.parse(note.content) : note.content;
            putContent({ id: note.id, title: note.title, document, kind: 'text', tone: 'sage' });
            coordinator.stage(catalogOperation('card', { id: note.id, createdTime: note.createdTime, lastEditedTime: note.lastEditedTime, isTrashed: false, propertiesConfig: note.propertiesConfig || [] }));
            await coordinator.flush();
            return { success: true };
        }
        if (method === 'addMediaCard') {
            const cards = Array.isArray(payload) ? payload : [payload];
            for (const card of cards) {
                const content = { id: card.id, title: card.title || 'Image', body: '', kind: 'image', tone: 'sage', document: null };
                putContent(content);
                coordinator.stage(catalogOperation('card', { ...card, id: card.id, type: 'MediaCard', createdTime: card.createdTime, lastEditedTime: card.lastEditedTime, isTrashed: false }));
            }
            await coordinator.flush();
            return { success: true, mediaCards: cards };
        }
        if (method === 'addMediaCardInstance') {
            const items = Array.isArray(payload) ? payload : [payload];
            for (const item of items) {
                const instanceRow = {
                    id: item.id,
                    contentId: item.objectId,
                    boardId: item.whiteboardId,
                    x: item.x,
                    y: item.y,
                    width: item.width || 400,
                    height: item.height || 300,
                    z: instances.size
                };
                coordinator.stage({ type: 'putInstance', data: instanceRow });
                coordinator.stage(catalogOperation('instance', { ...item, type: 'MediaCard' }));
                instances.set(item.id, { ...instanceRow, attributes: { ...item, type: 'MediaCard' } });
            }
            await coordinator.flush();
            store.getState().setNodes([...instances.values()].filter(row => row.boardId === getBoardId()).map(toNode));
            return { success: true };
        }
        if (method === 'updateNoteCardInstance' || method === 'batchUpdateCardInstances') {
            const items = method === 'updateNoteCardInstance' ? [{ id: payload.id, updates: payload.updates }] : payload;
            for (const item of items) {
                const existing = instances.get(item.id);
                if (!existing) continue;
                const nextAttributes = { ...existing.attributes, ...item.updates, id: item.id };
                instances.set(item.id, { ...existing, attributes: nextAttributes });
                coordinator.stage(catalogOperation('instance', nextAttributes));
            }
            await coordinator.flush();
            store.getState().setNodes(nodes => nodes.map(node => {
                const matched = items.find(it => it.id === node.id);
                if (!matched) return node;
                return { ...node, data: { ...node.data, ...matched.updates } };
            }));
            return { success: true };
        }
        if (method === 'deleteNoteCardInstance') {
            const id = typeof payload === 'string' ? payload : payload.id;
            instances.delete(id);
            coordinator.stage({ type: 'deleteInstance', id });
            await coordinator.flush();
            store.getState().setNodes(nodes => nodes.filter(node => node.id !== id));
            return { success: true };
        }
        const id = payload.id || payload.objectId;
        if (!contents.has(id))
            throw Error('卡片不存在');
        if (method === 'updateNoteCard') {
            const updates = payload.updates || payload || {};
            const rawDoc = updates.content || updates.document || payload.document || payload.content;
            const document = typeof rawDoc === 'string' ? JSON.parse(rawDoc) : rawDoc;
            if (document)
                acceptContentDocument(id, document, updates.body || payload.body);
            const metadata = { ...((await load()).cardMetadata || []).find(row => row.id === id), ...updates, id };
            delete metadata.content;
            delete metadata.document;
            delete metadata.title;
            delete metadata.body;
            coordinator.stage(catalogOperation('card', metadata));
        }
        else if (method === 'upsertCardRemark')
            coordinator.stage(catalogOperation('remark', { id, objectType: payload.objectType, content: payload.content }));
        else
            throw Error('尚未接入此卡片寫入：' + method);
        await coordinator.flush();
        return { success: true };
    });
}
