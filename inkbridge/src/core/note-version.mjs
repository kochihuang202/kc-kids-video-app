// Native note-editor services only; the child cannot call arbitrary workspace
// writes or bypass the content-version commit contract through generic RPC.
export const standaloneServices = Object.freeze(['getNoteCardById', 'getTagsByCardId', 'getWhiteboardsByCardId', 'getCardLinks', 'getTagPropertyList', 'getCardRemark', 'getTagList', 'getTag', 'findTargetsByCardIdAndType', 'globalSearch', 'searchBlocksWithIds', 'getFileById', 'getMediaCardById', 'getMediaCardByFileId', 'getPdfCardById', 'writeClipboardTextAndHtml', 'openFileInShell', 'openNoteCardWindow', 'exportNoteCardToMarkdown', 'saveDocxFromXml', 'resolveExportImages', 'getNoteCardContentVersions', 'upsertCardRemark', 'updateEditorConfig']);
export function documentIdentity(value) {
    const canonical = item => Array.isArray(item) ? item.map(canonical) : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().filter(key => item[key] !== undefined).map(key => [key, canonical(item[key])])) : item;
    return JSON.stringify(canonical(value));
}
export function checkNoteVersion(current, expectedRevision, document) {
    if (!current)
        throw Object.assign(Error('卡片已不存在或已移至回收站'), { code: 'NOTE_UNAVAILABLE' });
    if (documentIdentity(current.document) === documentIdentity(document))
        return false;
    if (current.revision !== expectedRevision)
        throw Object.assign(Error('其他視窗已修改此卡片；目前草稿保留，請先保留草稿並載入最新版本'), { code: 'CONTENT_CONFLICT' });
    return true;
}
