// InkBridge schema adapter for the original 57152/13177 service contracts.
// Sources: background getCardsByFilters917676, advanced907363..910947,
// whiteboard membership966792; the UI itself remains the original factories.
export function noteRecord(graph, content) { const meta = graph.cardMetadata?.find(row => row.id === content.id) || {}; return { createdTime: null, lastEditedTime: null, isTrashed: false, propertiesConfig: [], insights: [], ...meta, id: content.id, title: content.title, content: content.document, type: 'NoteCard', apprearedInWhiteboards: graph.boards.filter(board => !board.attributes?.isTrashed && graph.instances.some(instance => instance.contentId === content.id && instance.boardId === board.id)).map(board => ({ id: board.id, name: board.title })) }; }
export function emptyNote(value) { if (typeof value === 'string') {
    try {
        value = JSON.parse(value);
    }
    catch {
        return true;
    }
} const meaningful = nodes => Array.isArray(nodes) && nodes.some(node => { if (!node)
    return false; switch (node.type) {
    case 'text':
    case 'code-highlight': return !!String(node.text ?? '').trim() || meaningful(node.children);
    case 'mention':
        if (String(node.mentionName ?? '').trim() || node.objectId)
            return true;
        break;
    case 'equation':
        if (String(node.equation ?? '').trim())
            return true;
        break;
    case 'image':
        if (node.src)
            return true;
        break;
    case 'embed-card':
        if (node.objectId)
            return true;
        break;
    case 'time':
    case 'table':
    case 'mermaid':
    case 'youtube':
    case 'file':
    case 'horizontalrule':
    case 'page-break':
    case 'layout-container': return true;
} return meaningful(node.children); }); return !meaningful(value?.root?.children); }
function conditionMatches(row, condition, tagIds) { const values = Array.isArray(condition.value) ? condition.value : [condition.value], op = condition.operator; let actual; if (condition.type === 'tag')
    actual = tagIds;
else if (condition.type === 'whiteboard')
    actual = row.apprearedInWhiteboards.map(board => board.id);
else if (condition.type === 'cardType')
    actual = [row.type];
else if (condition.type === 'keyword') {
    const value = String(condition.value || '').trim().toLowerCase(), title = (row.title || '').toLowerCase(), json = JSON.stringify(row.content || {}).toLowerCase(), contains = title.includes(value) || json.includes(value);
    if (op === 'equals')
        return title.trim() === value || json === value;
    return op === 'notContains' || op === 'notEquals' ? !contains : contains;
}
else
    return false; if (op === 'isEmpty')
    return !actual.length; if (op === 'isNotEmpty')
    return !!actual.length; if (op === 'equals' || op === 'notEquals') {
    const equal = values.length === 1 && actual.includes(values[0]);
    return op === 'equals' ? equal : !equal;
} const overlap = values.some(value => actual.includes(value)); return op === 'notContains' ? !overlap : overlap; }
export function cardsByFilters(graph, request = {}) { const { cardTypes = ['NoteCard'], tags = [], whiteboardIds = [], page = 1, pageSize = 20, keyword = '', sortBy = 'updatedAt', sortOrder = 'desc', advancedFilter, filterEmptyNoteCards = false } = request; const conditions = (advancedFilter?.conditions || []).filter(c => c?.operator && (['isEmpty', 'isNotEmpty'].includes(c.operator) || (Array.isArray(c.value) ? c.value.length : String(c.value ?? '').trim().length))); let rows = cardTypes.includes('NoteCard') ? graph.contents.filter(c => c.kind === 'text').map(c => noteRecord(graph, c)).filter(c => !c.isTrashed) : []; rows = rows.filter(row => { const memberships = (graph.cardTags || []).filter(tag => tag.cardId === row.id).map(tag => tag.tagId); if (conditions.length) {
    const matches = conditions.map(c => conditionMatches(row, c, memberships));
    if (advancedFilter.logic === 'all' ? !matches.every(Boolean) : !matches.some(Boolean))
        return false;
}
else if ((tags.length && !tags.some(id => memberships.includes(id))) || (whiteboardIds.length && !row.apprearedInWhiteboards.some(b => whiteboardIds.includes(b.id))))
    return false; const text = (row.title + ' ' + JSON.stringify(row.content)).toLowerCase(); return (!keyword || text.includes(keyword.toLowerCase())) && (!filterEmptyNoteCards || emptyNote(row.content)); }); rows.sort((a, b) => Date.parse(b.lastEditedTime) - Date.parse(a.lastEditedTime)); const totalCount = rows.length; rows = rows.slice((page - 1) * pageSize, page * pageSize); if (sortBy === 'updatedAt' || sortBy === 'createdAt') {
    const field = sortBy === 'updatedAt' ? 'lastEditedTime' : 'createdTime';
    rows.sort((a, b) => (sortOrder === 'asc' ? 1 : -1) * (Date.parse(a[field]) - Date.parse(b[field])));
} return { success: true, data: rows, totalCount, page, pageSize }; }
export function boardPreviews(graph, ids) { return Object.fromEntries(ids.map(id => [id, { cardCount: graph.instances.filter(row => row.boardId === id).length, whiteboardCount: (graph.whiteboardInstances || []).filter(row => row.containerType === 'whiteboard' && row.containerId === id && !row.isTrashed).length }])); }
