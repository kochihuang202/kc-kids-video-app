import { noteRecord, attachmentRecord } from './original-catalog.mjs';
// Original globalSearch/mentions uses separate native result arrays. These
// projections cover the models present in this independent SQLite workspace.
export function searchGraph(graph, keyword = '') {
    const query = String(keyword).toLowerCase(), matches = (...values) => values.some(value => String(value || '').toLowerCase().includes(query)), sort = rows => rows.sort((a, b) => Date.parse(b.lastEditedTime || 0) - Date.parse(a.lastEditedTime || 0)), limit = rows => query ? rows : rows.slice(0, 10), cards = graph.contents.map(content => content.kind === 'text' ? noteRecord(graph, content) : attachmentRecord(graph, content)).filter(card => !card.isTrashed && matches(card.title, JSON.stringify(card.content), ...(graph.cardRemarks || []).filter(row => row.id === card.id).map(row => row.content)));
    return { noteCards: limit(sort(cards.filter(card => card.type === 'NoteCard'))), pdfCards: limit(sort(cards.filter(card => card.type === 'PDFCard'))), mediaCards: limit(sort(cards.filter(card => card.type === 'image'))), whiteBoardList: limit(graph.boards.filter(board => !board.attributes?.isTrashed && matches(board.title)).map(board => ({ ...board.attributes, id: board.id, name: board.title }))), files: limit((graph.files || []).filter(file => matches(file.name))), highlights: [], mindmaps: [], videoHighlights: [], audioHighlights: [], noteHighlights: [], quickNotes: [], websiteCards: [], mindMapNodes: [], sections: [] };
}
export function searchBlocks(graph, keyword) { const query = String(keyword || '').trim().toLowerCase(); if (!query)
    return []; const results = [], text = node => (node.text || node.mentionName || '') + (node.children || []).map(text).join(''); for (const content of graph.contents.filter(row => row.kind === 'text' && !graph.cardMetadata?.find(meta => meta.id === row.id)?.isTrashed && JSON.stringify(row.document).includes('blockId') && JSON.stringify(row.document).toLowerCase().includes(query)).slice(0, 50)) {
    const scan = node => { if (!node || results.length >= 30)
        return; const value = text(node); if (node.blockId && value.toLowerCase().includes(query))
        results.push({ id: `NoteCard:${content.id}:${node.blockId}`, type: 'Block', cardId: content.id, cardType: 'NoteCard', cardTitle: content.title || 'Untitled', blockId: node.blockId, snippet: value.slice(0, 200), content: content.document }); for (const child of node.children || [])
        scan(child); };
    scan(content.document?.root);
} return results; }
