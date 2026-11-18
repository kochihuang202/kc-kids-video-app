// Three-way merge of the existing schema. Rich text is one semantic field;
// arrays remain atomic. No clocks or revision counters select a winning edit.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs/promises'), crypto = require('node:crypto');
const { hashFile } = require('./stream-files.cjs');
const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
const dictionary = () => Object.create(null);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function stable(v) { if (v === undefined)
    return 'undefined'; if (Array.isArray(v))
    return '[' + v.map(stable).join(',') + ']'; if (object(v))
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'; return JSON.stringify(v); }
const equal = (a, b) => stable(a) === stable(b), clone = v => v === undefined ? undefined : structuredClone(v);
const digest = v => crypto.createHash('sha256').update(stable(v)).digest('hex');
const TABLES = ['boards', 'contents', 'instances', 'meta'];
function readState(file) {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
        db.exec('BEGIN');
        if (db.prepare('PRAGMA application_id').get().application_id !== 0x494e4b42 || db.prepare('PRAGMA user_version').get().user_version !== 1 || db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length)
            throw Error('合併來源資料庫驗證失敗');
        const state = { tables: {}, revision: 0, workspaceId: '' };
        for (const table of TABLES) {
            const map = state.tables[table] = dictionary();
            for (const row of db.prepare('SELECT * FROM ' + table).all()) {
                if (table === 'meta') {
                    if (row.key === 'revision') {
                        state.revision = Number(row.value);
                        continue;
                    }
                    if (row.key === 'workspaceId') {
                        state.workspaceId = row.value;
                        continue;
                    }
                    try {
                        map[row.key] = JSON.parse(row.value);
                    }
                    catch {
                        map[row.key] = row.value;
                    }
                    continue;
                }
                const value = { ...row };
                if (table === 'contents') {
                    value.text = { body: value.body, document: value.document_json === null ? null : JSON.parse(value.document_json) };
                    delete value.body;
                    delete value.document_json;
                }
                if (table === 'boards')
                    value.view_json = JSON.parse(value.view_json);
                map[row.id] = value;
            }
        }
        db.exec('COMMIT');
        return state;
    }
    finally {
        db.close();
    }
}
async function readVerifiedState(file, expected) { const stat = await fs.stat(file); if (stat.size !== expected.bytes || await hashFile(file) !== expected.sha256)
    throw Error('合併來源快照雜湊不符'); const state = readState(file); if (await hashFile(file) !== expected.sha256)
    throw Error('合併來源在讀取時改變'); return state; }
function semantic(state) { const tables = clone(state.tables); for (const row of Object.values(tables.contents))
    delete row.revision; for (const row of Object.values(tables.boards))
    delete row.view_json; return { workspaceId: state.workspaceId, tables }; }
const stateDigest = state => digest(semantic(state));
function refs(table, id, row) {
    if (!row)
        return [];
    if (table === 'instances')
        return [['boards', row.board_id], ['contents', row.content_id]];
    if (table !== 'meta' || !object(row))
        return [];
    const kind = id.split(':')[0], out = [], add = (t, k) => { if (k)
        out.push([t, k]); }, meta = (prefix, k) => { if (k)
        add('meta', prefix + ':' + k); };
    if (['card', 'remark', 'quick-note'].includes(kind))
        add('contents', row.id);
    if (kind === 'content-version')
        add('contents', row.noteCardId);
    if (kind === 'instance') {
        add('instances', row.id);
        meta('section', row.parentId);
    }
    if (kind === 'board')
        add('boards', id.slice(6));
    if (row.whiteboardId)
        add('boards', row.whiteboardId);
    if (kind === 'whiteboard-instance' && row.containerType === 'whiteboard')
        add('boards', row.containerId);
    if (kind === 'whiteboard-instance' && row.containerType === 'folder')
        meta('folder', row.containerId);
    if (['section', 'todo'].includes(kind))
        meta(kind, row.parentId);
    if (kind === 'mindmap-node') {
        meta('mindmap', row.mindMapId);
        for (const child of row.childNodeIds || [])
            meta('mindmap-node', child);
    }
    if (kind === 'mindmap-instance')
        meta('mindmap', row.objectId);
    if (kind === 'mindmap' && row.rootNodeId)
        meta('mindmap-node', row.rootNodeId);
    if (kind === 'video-highlight-instance')
        meta('video-highlight', row.objectId);
    if (kind === 'card-tag') {
        add('contents', row.cardId);
        meta('tag', row.tagId);
    }
    // CAS references are independently checked by inspectDatabase before publication.
    return out;
}
function changes(state, base, table, id) {
    const clean = v => meaningfulRow(table, v);
    return !equal(clean(state.tables[table][id]), clean(base.tables[table][id]));
}
function meaningfulRow(table, value) { const row = clone(value); if (!row)
    return row; if (table === 'contents')
    delete row.revision; if (table === 'boards')
    delete row.view_json; if (table === 'meta' && object(row))
    for (const field of ['lastEditedTime', 'lastEditedContentTime', 'updatedAt', 'modifiedAt'])
        delete row[field]; return row; }
function describe(state, table, id) {
    const row = state.tables[table][id], t = state.tables;
    let contentId = table === 'contents' ? id : table === 'instances' ? row?.content_id : table === 'meta' && /^(card|remark|content-version):/.test(id) ? row?.noteCardId || row?.id : null;
    let boardId = table === 'boards' ? id : table === 'instances' ? row?.board_id : row?.whiteboardId;
    if (!boardId && contentId)
        boardId = Object.values(t.instances).find(r => r.content_id === contentId)?.board_id;
    const title = t.contents[contentId]?.title || t.boards[boardId]?.title || row?.name || row?.title || '未命名項目';
    return { title, board: t.boards[boardId]?.title || '', kind: table === 'boards' ? '白板' : table === 'instances' ? '卡片位置' : table === 'contents' ? '卡片' : id.split(':')[0] };
}
function preview(value) {
    if (value === undefined)
        return '已刪除';
    if (value === null)
        return '空白';
    if (typeof value === 'string')
        return value.slice(0, 12000);
    if (object(value) && own(value, 'body') && own(value, 'document'))
        return value.body || textOf(value.document) || '空白內容';
    if (object(value) && value.text)
        return [value.title, preview(value.text)].filter(Boolean).join('\n');
    return JSON.stringify(value, null, 2).slice(0, 12000);
}
function textOf(v) { if (!v || typeof v !== 'object')
    return ''; return [typeof v.text === 'string' ? v.text : '', ...Object.values(v).filter(x => x && typeof x === 'object').map(x => Array.isArray(x) ? x.map(textOf).join(' ') : textOf(x))].filter(Boolean).join(' '); }
const structures = [['whiteboard-instance', ['whiteboardId', 'containerId', 'containerType']], ['section', ['parentId']], ['mindmap-node', ['childNodeIds']], ['todo', ['parentId']], ['connection', ['beginId', 'endId']]];
function cycle(state, kind) {
    const links = new Map(), add = (from, to, key) => { if (!links.has(from))
        links.set(from, []); links.get(from).push({ to, key }); };
    for (const [key, row] of Object.entries(state.tables.meta)) {
        if (!key.startsWith(kind + ':') || !row || row.isTrashed)
            continue;
        if (kind === 'whiteboard-instance') {
            if (row.containerType === 'whiteboard')
                add(row.containerId, row.whiteboardId, key);
        }
        else if (kind === 'mindmap-node') {
            for (const id of row.childNodeIds || [])
                add(row.id, id, key);
        }
        else if (kind === 'connection') {
            for (const id of [row.beginId, row.endId])
                if (own(state.tables.meta, 'connection:' + id))
                    add(row.id, id, key);
        }
        else if (row.parentId)
            add(row.id, row.parentId, key);
    }
    const visited = new Set(), path = [], edges = [], active = new Map();
    let found = null;
    function visit(id) { if (active.has(id)) {
        found = edges.slice(active.get(id));
        return;
    } if (visited.has(id) || found)
        return; active.set(id, path.length); path.push(id); for (const edge of links.get(id) || []) {
        edges.push(edge.key);
        visit(edge.to);
        if (found)
            return;
        edges.pop();
    } path.pop(); active.delete(id); visited.add(id); }
    for (const id of links.keys()) {
        visit(id);
        if (found)
            break;
    }
    return found && [...new Set(found)];
}
function assertSafeState(state) {
    for (const table of TABLES)
        for (const [id, row] of Object.entries(state.tables[table]))
            for (const [t, key] of refs(table, id, row))
                if (!own(state.tables[t], key))
                    throw Error('合併後仍有未解決的關聯，已保留原始資料');
    for (const [kind] of structures)
        if (cycle(state, kind))
            throw Error('合併後的階層形成循環，已保留原始資料');
    const dates = new Set();
    for (const [key, row] of Object.entries(state.tables.meta))
        if (key.startsWith('quick-note:') && !row.isTrashed) {
            if (dates.has(row.date))
                throw Error('同一天有兩份日記，需要先確認要保留的項目');
            dates.add(row.date);
        }
}
const labels = { text: '文字與格式', title: '標題', tone: '卡片底色', kind: '卡片類型', x: '水平位置', y: '垂直位置', width: '寬度', height: '高度', z: '前後順序', isTrashed: '回收站狀態', position: '位置', size: '大小', content: '內容', parentId: '所屬群組', containerId: '所屬位置', containerType: '所屬位置類型', style: '樣式' };
function mergeStates(base, local, remote, choices = {}) {
    if (base.workspaceId !== local.workspaceId || base.workspaceId !== remote.workspaceId)
        throw Error('不能合併不同工作區');
    const conflicts = [], result = { workspaceId: local.workspaceId, revision: Math.max(local.revision, remote.revision) + 1, tables: Object.fromEntries(TABLES.map(t => [t, dictionary()])) };
    const conflict = (table, id, field, b, l, r, reason) => {
        const key = digest({ table, id, field, b, l, r, reason }), choice = choices[key];
        conflicts.push({ id: key, ...describe(l === undefined ? remote : local, table, id), field: labels[field] || field, reason: reason || '兩台修改了同一欄位', base: preview(b), local: preview(l), remote: preview(r), choice: ['local', 'remote'].includes(choice) ? choice : null });
        return clone(choice === 'remote' ? r : l);
    };
    function value(b, l, r, table, id, trail) {
        if (equal(l, r))
            return clone(l);
        if (equal(l, b))
            return clone(r);
        if (equal(r, b))
            return clone(l);
        const last = trail.at(-1), field = trail.join('.');
        if (['lastEditedTime', 'lastEditedContentTime', 'updatedAt', 'modifiedAt'].includes(last) && [l, r].every(v => typeof v === 'string' && Number.isFinite(Date.parse(v))))
            return [l, r].sort((a, b) => Date.parse(b) - Date.parse(a))[0];
        if (object(b) && object(l) && object(r) && !['text', 'position'].includes(last) && !b.root && !l.root && !r.root) {
            const out = dictionary(), geometry = [b, l, r].every(v => Number.isFinite(v.x) && Number.isFinite(v.y));
            if (geometry)
                Object.assign(out, value({ x: b.x, y: b.y }, { x: l.x, y: l.y }, { x: r.x, y: r.y }, table, id, [...trail, 'position']));
            for (const k of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])) {
                if (geometry && ['x', 'y'].includes(k))
                    continue;
                const next = value(b[k], l[k], r[k], table, id, [...trail, k]);
                if (next !== undefined)
                    out[k] = next;
            }
            return out;
        }
        return conflict(table, id, field || '整個項目', b, l, r, l === undefined || r === undefined ? '一台刪除，另一台修改' : '兩台修改了同一欄位');
    }
    for (const table of TABLES) {
        const b = base.tables[table], l = local.tables[table], r = remote.tables[table];
        for (const id of [...new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])].sort()) {
            const clean = row => { row = clone(row); if (table === 'contents' && row)
                delete row.revision; if (table === 'boards' && row)
                delete row.view_json; if (table === 'instances' && row) {
                row.position = { x: row.x, y: row.y };
                delete row.x;
                delete row.y;
            } if (table === 'meta' && id.startsWith('instance:') && row)
                for (const k of ['x', 'y', 'width', 'height'])
                    delete row[k]; return row; };
            const lifecycleEntity = ['boards', 'contents', 'instances'].includes(table) && b[id] && (!l[id] || !r[id]);
            const lifecycleMeta = table === 'meta' && /^(board|card|instance):/.test(id) && (() => { const kind = id.split(':')[0], t = { board: 'boards', card: 'contents', instance: 'instances' }[kind], key = id.slice(kind.length + 1); return base.tables[t][key] && (!local.tables[t][key] || !remote.tables[t][key]); })();
            const duplicateAsset = table === 'meta' && id.startsWith('file:') && !b[id] && l[id] && r[id] && l[id].sha256 === id.slice(5) && r[id].sha256 === id.slice(5) && l[id].size === r[id].size;
            // Independently importing identical immutable bytes is one asset, even if
            // the source filenames/extensions differ. Relative HTML names remain in
            // each immutable bundle; byte identity, not the storage suffix, is authority.
            const assetOrder = v => (v.type === 'htmlbundle' ? '0' : '1') + stable(v);
            let merged = duplicateAsset ? clone(assetOrder(l[id]) < assetOrder(r[id]) ? l[id] : r[id]) : lifecycleEntity || lifecycleMeta ? undefined : value(clean(b[id]), clean(l[id]), clean(r[id]), table, id, []);
            if (merged !== undefined) {
                if (table === 'contents')
                    merged.revision = Math.max(l[id]?.revision || 0, r[id]?.revision || 0, b[id]?.revision || 0) + (!equal(clean(l[id]), merged) && !equal(clean(r[id]), merged) ? 1 : 0);
                if (table === 'boards')
                    merged.view_json = clone(l[id]?.view_json || r[id]?.view_json || b[id]?.view_json);
                if (table === 'instances') {
                    Object.assign(merged, merged.position);
                    delete merged.position;
                }
                result.tables[table][id] = merged;
            }
        }
    }
    // Deletion/trashing of a parent versus edits to its contents is a conflict even
    // when the parent row itself was unchanged on the editing computer.
    const removedParents = new Set();
    for (const table of ['boards', 'contents', 'instances'])
        for (const id of Object.keys(base.tables[table])) {
            const metaKey = { boards: 'board:', contents: 'card:', instances: 'instance:' }[table] + id, dead = s => !s.tables[table][id] || !!s.tables.meta[metaKey]?.isTrashed, lDead = dead(local), rDead = dead(remote);
            if (lDead === rDead)
                continue;
            const survivor = lDead ? remote : local;
            const related = (s, t, k, row) => t === table && k === id || t === 'meta' && k === metaKey || table === 'contents' && t === 'instances' && row.content_id === id || table === 'boards' && (t === 'instances' && row.board_id === id || t === 'meta' && row?.whiteboardId === id) || table === 'contents' && t === 'meta' && ['card', 'remark', 'content-version'].includes(k.split(':')[0]) && (row.id === id || row.noteCardId === id);
            const affected = [];
            for (const t of TABLES)
                for (const [k, row] of Object.entries(survivor.tables[t]))
                    if (related(survivor, t, k, row))
                        affected.push([t, k]);
            if (table === 'boards')
                for (const row of Object.values(survivor.tables.instances).filter(r => r.board_id === id)) {
                    affected.push(['contents', row.content_id], ['meta', 'card:' + row.content_id]);
                }
            if (table === 'instances') {
                const row = survivor.tables.instances[id];
                affected.push(['contents', row.content_id], ['meta', 'card:' + row.content_id]);
            }
            if (!affected.some(([t, k]) => changes(survivor, base, t, k)))
                continue;
            const scope = s => affected.map(([t, k]) => [t, k, meaningfulRow(t, s.tables[t][k])]);
            const key = digest({ lifecycle: table, id, base: scope(base), local: scope(local), remote: scope(remote) }), choice = choices[key];
            conflicts.push({ id: key, ...describe(survivor, table, id), field: '刪除與內容修改', reason: '一台刪除或移至回收站，另一台修改了此項目或其中的內容', base: '原本存在', local: lDead ? '已刪除／移至回收站' : '保留，含新修改', remote: rDead ? '已刪除／移至回收站' : '保留，含新修改', choice: ['local', 'remote'].includes(choice) ? choice : null });
            const selected = choice === 'remote' ? remote : local;
            if (!dead(selected)) {
                result.tables[table][id] ||= clone(selected.tables[table][id]);
                result.tables.meta[metaKey] = { ...result.tables.meta[metaKey], ...(!result.tables.meta[metaKey] ? selected.tables.meta[metaKey] : {}), isTrashed: false };
                for (const [t, k] of affected)
                    if (!own(result.tables[t], k) && selected.tables[t][k] !== undefined)
                        result.tables[t][k] = clone(selected.tables[t][k]);
            }
            else if (!selected.tables[table][id]) {
                delete result.tables[table][id];
                delete result.tables.meta[metaKey];
                removedParents.add(table + ':' + id);
            }
            else if (result.tables[table][id])
                result.tables.meta[metaKey] = { ...result.tables.meta[metaKey], isTrashed: true };
        }
    // A confirmed physical deletion includes its dependent appearances/links.
    // Do not offer a later dependency choice which silently reverses that choice.
    for (let changed = true; changed;) {
        changed = false;
        for (const t of TABLES)
            for (const [id, row] of Object.entries(result.tables[t]))
                if (refs(t, id, row).some(([target, key]) => removedParents.has(target + ':' + key))) {
                    delete result.tables[t][id];
                    removedParents.add(t + ':' + id);
                    changed = true;
                }
    }
    // Never silently discard an independently added reference to a removed parent.
    // Resolve each missing relation by keeping its complete source or removing it.
    let again = true;
    const handled = new Set();
    while (again) {
        again = false;
        for (const table of TABLES)
            for (const [id, row] of Object.entries(result.tables[table]))
                for (const [target, key] of refs(table, id, row)) {
                    if (own(result.tables[target], key))
                        continue;
                    const marker = table + ':' + id + '>' + target + ':' + key;
                    if (handled.has(marker))
                        continue;
                    handled.add(marker);
                    const source = own(local.tables[table], id) ? local : remote, cid = digest({ relation: marker, row, missing: key }), choice = choices[cid];
                    conflicts.push({ id: cid, ...describe(source, table, id), field: '關聯項目', reason: '保留此項目需要一個已被另一台移除的白板、卡片或群組', base: '原有關聯', local: '保留此項目及必要關聯', remote: '移除此項目（原版本仍保留）', choice: ['local', 'remote'].includes(choice) ? choice : null });
                    if (choice === 'remote') {
                        delete result.tables[table][id];
                        again = true;
                        break;
                    }
                    const dependency = source.tables[target][key] ?? base.tables[target][key];
                    if (dependency !== undefined) {
                        result.tables[target][key] = clone(dependency);
                        again = true;
                    }
                }
    }
    for (const [kind, fields] of structures) {
        const seen = new Set();
        let ids;
        while ((ids = cycle(result, kind))) {
            ids.sort();
            const marker = ids.join('|');
            if (seen.has(marker))
                break;
            seen.add(marker);
            const describeStructure = s => ids.map(id => ({ id, ...Object.fromEntries(fields.map(f => [f, s.tables.meta[id]?.[f]])) }));
            const cid = digest({ cycle: kind, ids, local: describeStructure(local), remote: describeStructure(remote) }), choice = choices[cid], source = choice === 'remote' ? remote : local;
            conflicts.push({ id: cid, title: '階層與連結', board: '', kind, field: '循環關聯', reason: '兩邊各自有效的階層變更，合在一起會形成循環；請選擇要採用哪一邊的關係', base: preview(describeStructure(base)), local: preview(describeStructure(local)), remote: preview(describeStructure(remote)), choice: ['local', 'remote'].includes(choice) ? choice : null });
            for (const id of ids) {
                if (!source.tables.meta[id]) {
                    delete result.tables.meta[id];
                    continue;
                }
                result.tables.meta[id] ||= clone(source.tables.meta[id]);
                for (const field of fields) {
                    if (own(source.tables.meta[id], field))
                        result.tables.meta[id][field] = clone(source.tables.meta[id][field]);
                    else
                        delete result.tables.meta[id][field];
                }
            }
        }
    }
    // Two offline creations for the same diary date need an explicit decision;
    // both note bodies remain stored, the other entry is retained in the trash.
    const dates = new Map();
    for (const [key, row] of Object.entries(result.tables.meta))
        if (key.startsWith('quick-note:') && !row.isTrashed) {
            const prior = dates.get(row.date);
            if (!prior) {
                dates.set(row.date, key);
                continue;
            }
            const ids = [prior, key].sort(), cid = digest({ diaryDate: row.date, ids }), choice = choices[cid], localKey = ids.find(id => local.tables.meta[id] && !remote.tables.meta[id]) || ids[0], remoteKey = ids.find(id => remote.tables.meta[id] && !local.tables.meta[id]) || ids[1];
            conflicts.push({ id: cid, title: row.date + ' 日記', board: '日記', kind: 'quick-note', field: '同一天的日記', reason: '兩台離線建立了同一天的日記；另一份會保留在回收站', base: '當時尚未建立', local: preview(result.tables.contents[result.tables.meta[localKey].id]?.text), remote: preview(result.tables.contents[result.tables.meta[remoteKey].id]?.text), choice: ['local', 'remote'].includes(choice) ? choice : null });
            const keep = choice === 'remote' ? remoteKey : localKey, other = ids.find(id => id !== keep);
            result.tables.meta[other] = { ...result.tables.meta[other], isTrashed: true };
            dates.set(row.date, keep);
        }
    for (const [key, row] of Object.entries(result.tables.meta))
        if (key.startsWith('instance:')) {
            const instance = result.tables.instances[key.slice(9)];
            if (instance)
                for (const field of ['x', 'y', 'width', 'height'])
                    if ([base, local, remote].some(s => own(s.tables.meta[key], field)))
                        row[field] = instance[field];
        }
    return { state: result, conflicts, unresolved: conflicts.filter(c => !c.choice) };
}
function writeState(file, state) {
    assertSafeState(state);
    const db = new DatabaseSync(file);
    try {
        db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON; DELETE FROM instances; DELETE FROM contents; DELETE FROM boards; DELETE FROM meta; DELETE FROM commit_receipts;');
        for (const row of Object.values(state.tables.boards))
            db.prepare('INSERT INTO boards VALUES(?,?,?)').run(row.id, row.title, stable(row.view_json));
        for (const row of Object.values(state.tables.contents))
            db.prepare('INSERT INTO contents VALUES(?,?,?,?,?,?,?)').run(row.id, row.title, row.text.body, row.text.document === null ? null : stable(row.text.document), row.kind, row.tone, Math.max(1, row.revision));
        for (const row of Object.values(state.tables.instances))
            db.prepare('INSERT INTO instances VALUES(?,?,?,?,?,?,?,?)').run(row.id, row.content_id, row.board_id, row.x, row.y, row.width, row.height, row.z);
        const put = db.prepare('INSERT INTO meta VALUES(?,?)');
        put.run('workspaceId', state.workspaceId);
        put.run('revision', String(state.revision));
        for (const [key, value] of Object.entries(state.tables.meta))
            put.run(key, stable(value));
        if (db.prepare('PRAGMA foreign_key_check').all().length)
            throw Error('合併後仍有未解決的關聯');
        db.exec('COMMIT');
    }
    catch (e) {
        try {
            db.exec('ROLLBACK');
        }
        catch { }
        throw e;
    }
    finally {
        db.close();
    }
}
module.exports = { readState, readVerifiedState, mergeStates, writeState, stateDigest, semantic, stable, refs, assertSafeState };
