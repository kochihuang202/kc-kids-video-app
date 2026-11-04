import { documentIdentity } from './note-version.mjs';
const fields = { folder: 'folders', 'whiteboard-instance': 'whiteboardInstances', card: 'cardMetadata', tag: 'tags', 'card-tag': 'cardTags', remark: 'cardRemarks', file: 'files', 'content-version': 'contentVersions', 'tag-group': 'tagGroups', collection: 'collections', 'collection-view': 'collectionViews', 'saved-tab': 'savedTabs', 'tab-group': 'tabGroups', connection: 'connections', section: 'sections', 'drawing-stroke':'drawingStrokes',mindmap:'mindmaps','mindmap-node':'mindmapNodes','mindmap-instance':'mindmapInstances' };
function ref(op) { const id = op.id || op.data?.id; if (op.type === 'putContent')
    return ['content', id]; if (op.type === 'putBoard')
    return ['board', id]; if (['putInstance', 'deleteInstance'].includes(op.type))
    return ['instance', id]; if (['putCatalog', 'deleteCatalog'].includes(op.type))
    return ['catalog:' + op.kind, id]; throw Error('Unsupported shared-window operation: ' + op.type); }
function record(graph, [type, id]) {
    if (type === 'content')
        return graph.contents.find(row => row.id === id) || null;
    if (type === 'board')
        return graph.boards.find(row => row.id === id) || null;
    if (type === 'instance') {
        const row = graph.instances.find(row => row.id === id);
        if (!row)
            return null;
        const { attributes, ...core } = row;
        return core;
    }
    const kind = type.slice(8);
    if (kind === 'board')
        return graph.boards.find(row => row.id === id)?.attributes || null;
    if (kind === 'instance')
        return graph.instances.find(row => row.id === id)?.attributes || null;
    if (!fields[kind])
        throw Error('Unsupported shared-window catalog: ' + kind);
    return (graph[fields[kind]] || []).find(row => row.id === id) || null;
}
export function windowExpectations(graph, operations) { return operations.map(op => ({ key: ref(op).join(':'), value: documentIdentity(record(graph, ref(op))) })); }
export function assertWindowExpectations(graph, operations, expected) {
    for (const op of operations)
        if (op.type === 'putContent' && (graph.cardMetadata || []).some(row => row.id === op.data.id && row.isTrashed))
            throw Object.assign(Error('卡片已移至回收站；白板視窗草稿保留'), { code: 'NOTE_UNAVAILABLE' });
    const actual = windowExpectations(graph, operations);
    if (!Array.isArray(expected) || actual.length !== expected.length)
        throw Error('Missing shared-window preconditions');
    actual.forEach((row, i) => {
        if(row.key===expected[i]?.key&&row.value===expected[i]?.value)return;
        const op=operations[i],instance=graph.instances.find(item=>item.id===op.data?.id);
        // Native auto-height persists a derived measurement from each renderer.
        // Only that field may race; moves, resizing, identity and manual heights
        // retain the normal conflict barrier. Never merge rich-text documents.
        if(row.key===expected[i]?.key&&op.type==='putInstance'&&instance?.attributes?.isAutoHeight!==false&&!operations.some(item=>item.type==='putCatalog'&&item.kind==='instance'&&item.data.id===op.data.id&&item.data.isAutoHeight===false)){
            const base=JSON.parse(expected[i].value),current=record(graph,ref(op));
            if(base&&current&&op.data.height!==base.height){const withoutHeight=value=>{const {height,attributes,...rest}=value;return documentIdentity(rest);};if(withoutHeight(base)===withoutHeight(current)&&withoutHeight(base)===withoutHeight(op.data))return;}
        }
        throw Object.assign(Error('另一個視窗已修改同一筆資料；此視窗草稿保留，請先保留草稿再重新載入'), { code: 'WORKSPACE_CONFLICT' });
    });
}
// Project only the existing InkBridge operation contract. SQLite remains the
// validator and sole durable authority; this updates the writer's live editors
// before awaiting COMMIT, so subsequent keystrokes start from the new document.
export function projectWindowOperations(graph, operations) {
    const next = structuredClone(graph), put = (field, data) => { const rows = next[field] ||= [], index = rows.findIndex(row => row.id === data.id); if (index < 0)
        rows.push(structuredClone(data));
    else
        rows[index] = structuredClone(data); next[field] = rows; };
    const removeConnections = seed => { const ids = new Set([seed]); let again = true; while (again) {
        again = false;
        for (const edge of next.connections || [])
            if (!ids.has(edge.id) && (ids.has(edge.beginId) || ids.has(edge.endId))) {
                ids.add(edge.id);
                again = true;
            }
    } next.connections = (next.connections || []).filter(edge => !ids.has(edge.id)); };
    for (const op of operations) {
        const [type, id] = ref(op);
        if (type === 'content')
            put('contents', op.data);
        else if (type === 'board') {
            const { attributes, ...core } = op.data;
            put('boards', { ...next.boards.find(row => row.id === id), ...core, ...attributes !== undefined ? { attributes } : {} });
        }
        else if (type === 'instance') {
            if (op.type === 'deleteInstance') {
                next.instances = next.instances.filter(row => row.id !== id);
                removeConnections(id);
            }
            else {
                const { attributes, ...core } = op.data;
                put('instances', { ...next.instances.find(row => row.id === id), ...core });
            }
        }
        else {
            const kind = op.kind;
            if (kind === 'board' || kind === 'instance') {
                const row = (kind === 'board' ? next.boards : next.instances).find(row => row.id === id);
                if (row) {
                    if (op.type === 'deleteCatalog')
                        delete row.attributes;
                    else
                        row.attributes = structuredClone(op.data);
                }
            }
            else if (op.type === 'deleteCatalog') {
                next[fields[kind]] = (next[fields[kind]] || []).filter(row => row.id !== id);
                if (kind === 'connection')
                    removeConnections(id);
            }
            else
                put(fields[kind], op.data);
        }
    }
    return next;
}
// ACKs advance only the records actually written. Other records must not become
// an unseen new editing base while this renderer still displays an older graph.
export function advanceWindowBaseline(baseline, saved, operations) {
    let next = structuredClone(baseline);
    for (const op of operations) {
        const key = ref(op), value = record(saved, key);
        if (value === null) {
            if (key[0] === 'content')
                next.contents = next.contents.filter(row => row.id !== key[1]);
            else if (key[0] === 'instance')
                next.instances = next.instances.filter(row => row.id !== key[1]);
            else
                next = projectWindowOperations(next, [{ type: 'deleteCatalog', kind: op.kind, id: key[1] }]);
        }
        else
            next = projectWindowOperations(next, [key[0] === 'content' ? { type: 'putContent', data: value } : key[0] === 'board' ? { type: 'putBoard', data: value } : key[0] === 'instance' ? { type: 'putInstance', data: value } : { type: 'putCatalog', kind: op.kind, data: value }]);
        if (op.type === 'putContent') {
            const meta = (saved.cardMetadata || []).find(row => row.id === key[1]);
            if (meta)
                next = projectWindowOperations(next, [{ type: 'putCatalog', kind: 'card', data: meta }]);
        }
    }
    next.revision = saved.revision;
    return next;
}
