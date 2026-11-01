// Own SQLite boundary for the original48626 import and96895/10764 reader.
// Full native PDF parsing, rendering and pagination remain in their modules.
export function createOriginalPdf({ navigate, coordinator, load, contents, instances, putContent, catalogOperation, store, toNode, getBoardId }) {
    const names = new Set(['addPdfCard', 'addPdfCardInstance', 'batchAddPdfCardInstances', 'updatePdfCard', 'updatePdfCardInstance', 'updatePdfCardCurrentPage', 'updateTotalPages', 'updatePdfCardViewPrefs', 'getPdfCardById', 'getPDFList', 'getHighlightsBySourceId']);
    const pending = new Map(), put = (kind, data) => coordinator.stage(catalogOperation(kind, data));
    const refresh = () => store.getState().setNodes([...instances.values()].filter(row => row.boardId === getBoardId()).map(toNode));
    const insertInstance = row => { if (!contents.has(row.objectId))
        throw Error('PDF content missing'); const item = { id: row.id, contentId: row.objectId, boardId: row.whiteboardId, x: row.x, y: row.y, width: row.width || 500, height: row.height || 700, z: instances.size, attributes: { ...row, type: 'PDFCard' } }; coordinator.stage({ type: 'putInstance', data: item }); put('instance', item.attributes); instances.set(item.id, item); };
    const record = (graph, id) => { const content = graph.contents.find(row => row.id === id && row.kind === 'pdf'); return content ? { ...graph.cardMetadata?.find(row => row.id === id), id, title: content.title } : null; };
    const call = (name, payload) => navigate(async () => {
        await coordinator.flush();
        const graph = await load();
        if (name === 'getPDFList')
            return { success: true, pdfList: graph.contents.filter(row => row.kind === 'pdf').map(row => record(graph, row.id)).filter(row => !row.isTrashed), highlights: [] };
        if (name === 'getHighlightsBySourceId')
            return { success: true, list: [], pdf: record(graph, typeof payload === 'string' ? payload : payload.sourceId) };
        if (name === 'getPdfCardById') {
            const pdfCard = record(graph, typeof payload === 'string' ? payload : payload.id);
            return { success: !!pdfCard, pdfCard, file: pdfCard ? graph.files?.find(file => file.id === pdfCard.fileId) : null };
        }
        if (name === 'addPdfCardInstance' || name === 'batchAddPdfCardInstances') {
            const rows = Array.isArray(payload) ? payload : [payload];
            for (const row of rows) {
                if (!contents.has(row.objectId))
                    pending.set(row.id, row);
                else
                    insertInstance(row);
            }
            await coordinator.flush();
            refresh();
            return { success: true };
        }
        if (name === 'addPdfCard') {
            const cards = Array.isArray(payload) ? payload : [payload];
            for (const card of cards) {
                if (contents.has(card.id))
                    throw Error('PDF ID already exists');
                if (!graph.files?.some(file => file.id === card.fileId && file.type === 'pdf'))
                    throw Error('PDF attachment is not registered');
            }
            for (const input of cards) {
                const card = { ...input, isTrashed: false };
                putContent({ id: card.id, title: card.title, kind: 'pdf', body: '', document: null, tone: 'sage' });
                contents.set(card.id, { ...contents.get(card.id), ...card, kind: 'pdf' });
                put('card', card);
                for (const [id, row] of pending)
                    if (row.objectId === card.id) {
                        insertInstance(row);
                        pending.delete(id);
                    }
            }
            await coordinator.flush();
            refresh();
            return { success: true, pdfCards: cards };
        }
        if (name === 'updatePdfCardInstance') {
            const previous = instances.get(payload.id);
            if (!previous || contents.get(previous.contentId)?.kind !== 'pdf')
                throw Error('PDF instance missing');
            const updates = payload.updates || {}, next = { ...previous, ...updates, attributes: { ...previous.attributes, ...updates, id: previous.id } };
            coordinator.stage({ type: 'putInstance', data: next });
            put('instance', next.attributes);
            await coordinator.flush();
            instances.set(next.id, next);
            refresh();
            return { success: true };
        }
        const id = payload.id, previous = record(graph, id);
        if (!previous)
            throw Error('PDF card missing');
        let updates = name === 'updatePdfCard' ? payload.updates : name === 'updatePdfCardCurrentPage' ? { currentPage: payload.currentPage } : name === 'updateTotalPages' ? { totalPages: payload.totalPages } : { zoomScale: payload.zoomScale, pageRotations: payload.pageRotations };
        updates = Object.fromEntries(Object.entries(updates || {}).filter(([, value]) => value !== undefined));
        if (updates.totalPages !== undefined && (!Number.isInteger(updates.totalPages) || updates.totalPages < 1))
            throw Error('Invalid PDF page count');
        const count = updates.totalPages || previous.totalPages;
        if (updates.currentPage !== undefined && (!Number.isInteger(updates.currentPage) || updates.currentPage < 1 || count && updates.currentPage > count))
            throw Error('Invalid PDF page');
        if (Object.entries(updates).every(([key, value]) => JSON.stringify(previous[key]) === JSON.stringify(value)))
            return { success: true, pdfCard: previous };
        const card = { ...previous, ...updates, lastEditedTime: new Date().toISOString() };
        put('card', card);
        if (updates.title !== undefined)
            putContent({ ...contents.get(id), title: updates.title });
        await coordinator.flush();
        contents.set(id, { ...contents.get(id), ...card, kind: 'pdf' });
        refresh();
        return { success: true, pdfCard: card };
    });
    return { has: name => names.has(name), call };
}
