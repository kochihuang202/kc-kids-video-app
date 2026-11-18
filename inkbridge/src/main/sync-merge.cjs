const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const { json, writeJSON } = require('./sync-files.cjs');
const { ancestorsOf } = require('./snapshot-lineage.cjs');
const { readVerifiedState, mergeStates, writeState, stable } = require('./workspace-merge.cjs');
const { copyVerified } = require('./stream-files.cjs');
const hash = v => crypto.createHash('sha256').update(stable(v)).digest('hex');
function mergeHeads(rows, localId) {
    const aliases = new Map(rows.filter(r => r.equivalentTo).map(r => [r.snapshotId, r.equivalentTo]));
    const canonical = id => { const seen = new Set(); while (aliases.has(id) && !seen.has(id)) {
        seen.add(id);
        id = aliases.get(id);
    } return id; };
    const graph = new Map(rows.filter(r => r.manifest).map(r => [r.snapshotId, { ...r.manifest, parentSnapshotIds: (r.manifest.parentSnapshotIds || [r.manifest.parentSnapshotId]).filter(Boolean).map(canonical) }]));
    const walks = new Map(), ancestors = id => { if (!walks.has(id))
        walks.set(id, ancestorsOf(graph, id).set); return walks.get(id); };
    const local = canonical(localId), ours = ancestors(local);
    const authorityId=graph.get(localId)?.authorityId||null;
    const candidates = rows.filter(r => (r.manifest?.authorityId||null)===authorityId&&r.integrity === 'complete' && !r.metadataOnly && !r.equivalentTo && r.snapshotId !== local && !ours.has(r.snapshotId));
    const tips = candidates.filter(r => !candidates.some(other => other !== r && ancestors(other.snapshotId).has(r.snapshotId))).sort((a, b) => a.snapshotId.localeCompare(b.snapshotId));
    if (!tips.length)
        return null;
    const remoteId = tips[0].snapshotId, theirs = ancestors(remoteId), common = [...ours].filter(id => theirs.has(id)), parents = new Set(common.flatMap(id => graph.get(id)?.parentSnapshotIds || []));
    const bases = common.filter(id => !parents.has(id));
    if (bases.length !== 1)
        throw Error('尚無單一可驗證的共同版本；已保留雙方修改，不能猜測合併');
    return { localId, remoteId, baseId: bases[0], tips: tips.map(t => t.snapshotId) };
}
function createSyncMerge({ localDirectory, snapshots, getExchange }) {
    const draftFile = path.join(localDirectory, 'Profile/merge-session.json');
    let active = null;
    async function plan(rows, status) {
        const heads = mergeHeads(rows.filter(r => r.workspaceId === status.workspaceId), status.baseSnapshotId);
        if (!heads) {
            active = null;
            return null;
        }
        const id = hash({ ...heads, workspaceId: status.workspaceId, revision: status.localRevision });
        // Immutable heads and an unchanged local revision keep the same verified
        // plan. Do not rehash every PDF/image on each 30-second conflict poll.
        if (active?.draft.id === id)
            return review();
        const previous = await json(draftFile, null);
        const [base, local, remoteManifest] = await Promise.all([snapshots.readMergeState(heads.baseId), snapshots.readMergeState(heads.localId), snapshots.manifest(status.workspaceId, heads.remoteId)]);
        const remote = await readVerifiedState(path.join(getExchange(), 'snapshots', status.workspaceId, heads.remoteId, 'database.sqlite3'), remoteManifest.database);
        const choices = previous?.choices && typeof previous.choices === 'object' ? previous.choices : {};
        const merged = mergeStates(base.state, local.state, remote, choices), validChoices = Object.fromEntries(merged.conflicts.filter(c => c.choice).map(c => [c.id, c.choice]));
        const draft = { format: 'inkbridge-merge-session', version: 1, id, workspaceId: status.workspaceId, ...heads, revision: status.localRevision, choices: validChoices, createdAt: previous?.id === id ? previous.createdAt : new Date().toISOString() };
        if (stable(previous) !== stable(draft))
            await writeJSON(draftFile, draft);
        active = { draft, merged, local, remoteManifest, base, remote };
        return review();
    }
    function review() { if (!active)
        return null; return { kind: 'merge-conflicts', sessionId: active.draft.id, workspaceId: active.draft.workspaceId, conflicts: active.merged.conflicts, remaining: active.merged.unresolved.length, local: { computer: active.local.manifest.sourceComputerName || '這台電腦', time: active.local.manifest.createdAt }, remote: { computer: active.remoteManifest.sourceComputerName || '另一台電腦', time: active.remoteManifest.createdAt }, originalsPreserved: true }; }
    async function choose({ sessionId, conflictId, choice }) {
        if (!active || sessionId !== active.draft.id)
            throw Error('內容已更新，請重新查看衝突；原有選擇仍保留');
        if (!['local', 'remote'].includes(choice) || !active.merged.conflicts.some(c => c.id === conflictId))
            throw Error('無效的合併選擇');
        active.draft.choices[conflictId] = choice;
        await writeJSON(draftFile, active.draft);
        active.merged = mergeStates(active.base.state, active.local.state, active.remote, active.draft.choices);
        return review();
    }
    async function prepare() {
        if (!active || active.merged.unresolved.length)
            throw Error('請先逐項選擇衝突的處理方式');
        const dir = path.join(localDirectory, 'MergeStaging', crypto.randomUUID()), file = path.join(dir, 'database.sqlite3');
        await fs.mkdir(dir, { recursive: true });
        try {
            await copyVerified(active.local.file, file, active.local.manifest.database);
            writeState(file, active.merged.state);
            const files = Object.entries(active.merged.state.tables.meta).filter(([k]) => k.startsWith('file:')).map(([_k, v]) => v);
            await snapshots.copyMergeAssets([active.remoteManifest], files);
            return await snapshots.prepareMerge({ file, parentSnapshotIds: [active.draft.localId, active.draft.remoteId] });
        }
        finally {
            await fs.rm(dir, { recursive: true, force: true });
        }
    }
    async function completed() { active = null; await fs.rm(draftFile, { force: true }); }
    return { plan, review, choose, prepare, completed };
}
module.exports = { createSyncMerge, mergeHeads };
