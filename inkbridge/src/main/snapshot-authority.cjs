const { ancestorsOf } = require('./snapshot-lineage.cjs');
function authorityHeads(rows) {
    const graph = new Map(rows.filter(r => r.manifest).map(r => [r.snapshotId, r.manifest])), authorities = [...new Map(rows.filter(r => r.manifest?.isAuthoritative && r.manifest.authorityId === r.snapshotId).map(r => [r.snapshotId, r])).values()], walks = new Map();
    const ancestors = id => { if (!walks.has(id))
        walks.set(id, ancestorsOf(graph, id).set); return walks.get(id); };
    return { graph, ancestors, heads: authorities.filter(a => !authorities.some(b => a !== b && ancestors(b.snapshotId).has(a.snapshotId))) };
}
function authorityDecision(rows, status) {
    rows = rows.filter(r => r.workspaceId === status.workspaceId);
    const { graph, ancestors, heads } = authorityHeads(rows);
    if (heads.length > 1)
        return { kind: 'authority-conflict', error: '兩台都指定了自己為準。請在要採用的電腦再按一次「以這台為準」；雙方內容均保留。' };
    const incoming = rows.some(r => r.manifest?.authorityId && r.manifest.authorityId !== status.authorityId && !graph.get(r.manifest.authorityId)?.isAuthoritative);
    if (incoming)
        return { kind: 'incomplete', error: '指定版本的關係檔案尚未到齊，已保留本機內容' };
    if (!heads.length || heads[0].snapshotId === status.authorityId)
        return null;
    const authority = heads[0], complete = rows.filter(r => r.integrity === 'complete' && !r.metadataOnly && r.manifest?.authorityId === authority.snapshotId && ancestors(r.snapshotId).has(authority.snapshotId)), tips = complete.filter(r => !complete.some(other => other !== r && ancestors(other.snapshotId).has(r.snapshotId))), target = tips.length === 1 ? tips[0] : complete.find(r => r.snapshotId === authority.snapshotId);
    if (!target)
        return { kind: 'incomplete', error: '正在等待指定版本及附件完整到齊，已保留本機內容' };
    return { kind: 'authority-align', candidate: { workspaceId: status.workspaceId, snapshotId: target.snapshotId, alignAuthority: true } };
}
module.exports = { authorityHeads, authorityDecision };
