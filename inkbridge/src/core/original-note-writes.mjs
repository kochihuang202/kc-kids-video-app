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
            const note = payload.noteCard;
            if (contents.has(note.id))
                throw Error('卡片ID已存在');
            const document = typeof note.content === 'string' ? JSON.parse(note.content) : note.content;
            putContent({ id: note.id, title: note.title, document, kind: 'text', tone: 'sage' });
            coordinator.stage(catalogOperation('card', { id: note.id, createdTime: note.createdTime, lastEditedTime: note.lastEditedTime, isTrashed: false, propertiesConfig: note.propertiesConfig || [] }));
            await coordinator.flush();
            return { success: true };
        }
        const id = payload.id || payload.objectId;
        if (!contents.has(id))
            throw Error('卡片不存在');
        if (method === 'updateNoteCard') {
            const updates = payload.updates || {}, document = typeof updates.content === 'string' ? JSON.parse(updates.content) : updates.content;
            if (document)
                acceptContentDocument(id, document);
            const metadata = { ...((await load()).cardMetadata || []).find(row => row.id === id), ...updates, id };
            delete metadata.content;
            delete metadata.title;
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
