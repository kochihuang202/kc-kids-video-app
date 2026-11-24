const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto'), fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { mergeStates, writeState, readState, stateDigest, assertSafeState } = require('../src/main/workspace-merge.cjs');
const { WorkspaceDatabase } = require('../src/main/database.cjs');

test('tag and collection deletion versus peer edits cannot leave dangling metadata',()=>{
 const b=base();Object.assign(b.tables.meta,{'tag:tag-a':{id:'tag-a',name:'A',subTagIds:[]},'tag:tag-b':{id:'tag-b',name:'B',subTagIds:[]},'tag-group:group':{id:'group',name:'Group',tags:['tag-a','tag-b']}});
 const l=structuredClone(b),r=structuredClone(b);delete l.tables.meta['tag:tag-a'];l.tables.meta['tag-group:group'].tags=['tag-b'];r.tables.meta['tag:tag-b'].subTagIds=['tag-a'];
 const m=mergeStates(b,l,r);assert(m.unresolved.length>0);assertSafeState(m.state);
 const invalid=structuredClone(b);invalid.tables.meta['collection-view:view']={id:'view',collectionId:'missing'};assert.throws(()=>assertSafeState(invalid),/關聯/);
 const cyclic=structuredClone(b);cyclic.tables.meta['tag:tag-a'].subTagIds=['tag-b'];cyclic.tables.meta['tag:tag-b'].subTagIds=['tag-a'];assert.throws(()=>assertSafeState(cyclic),/循環/);
});
function base() { return { workspaceId: crypto.randomUUID(), revision: 1, tables: { boards: { a: { id: 'a', title: '工作', view_json: { x: 0, y: 0, zoom: 1 } }, b: { id: 'b', title: '生活', view_json: { x: 0, y: 0, zoom: 1 } } }, contents: { one: { id: 'one', title: '報告', text: { body: '原文', document: null }, kind: 'text', tone: 'sage', revision: 1 }, two: { id: 'two', title: '家裡', text: { body: '另一張', document: null }, kind: 'text', tone: 'sage', revision: 1 } }, instances: { i: { id: 'i', content_id: 'one', board_id: 'a', x: 1, y: 2, width: 300, height: 200, z: 0 }, j: { id: 'j', content_id: 'two', board_id: 'b', x: 1, y: 2, width: 300, height: 200, z: 0 } }, meta: { 'card:one': { id: 'one', lastEditedTime: '2026-11-01T00:00:00Z' } } } }; }
test('different boards/cards and separate fields of one card merge symmetrically without conflicts', () => {
    const b = base(), l = structuredClone(b), r = structuredClone(b);
    l.tables.contents.one.text.body = '公司中文';
    r.tables.contents.two.text.body = '家裡修改';
    r.tables.instances.i.x = 100;
    r.tables.instances.i.y = 200;
    r.tables.contents.one.tone = 'rose';
    l.tables.meta['card:one'].lastEditedTime = '2026-11-02T00:00:00Z';
    r.tables.meta['card:one'].lastEditedTime = '2026-11-03T00:00:00Z';
    const m = mergeStates(b, l, r);
    assert.equal(m.unresolved.length, 0);
    assert.equal(m.state.tables.contents.one.text.body, '公司中文');
    assert.equal(m.state.tables.contents.two.text.body, '家裡修改');
    assert.equal(m.state.tables.contents.one.tone, 'rose');
    assert.equal(m.state.tables.instances.i.x, 100);
    assert.equal(stateDigest(m.state), stateDigest(mergeStates(b, r, l).state));
});
test('independent new cards and identical edits merge; viewing and counters are not edits', () => {
    const b = base(), l = structuredClone(b), r = structuredClone(b);
    l.tables.contents.left = { ...structuredClone(l.tables.contents.one), id: 'left' };
    r.tables.contents.right = { ...structuredClone(r.tables.contents.one), id: 'right' };
    l.tables.contents.one.revision = 90;
    r.tables.contents.one.revision = 120;
    l.tables.boards.a.view_json.x = 900;
    r.tables.boards.a.view_json.y = 300;
    const m = mergeStates(b, l, r);
    assert.equal(m.unresolved.length, 0);
    assert(m.state.tables.contents.left && m.state.tables.contents.right);
});
test('same text and competing moves have separate stable per-item decisions; rich text is atomic', () => {
    const b = base(), l = structuredClone(b), r = structuredClone(b);
    l.tables.contents.one.text = { body: '本機', document: { root: { text: '本機' } } };
    r.tables.contents.one.text = { body: '另一台', document: { root: { text: '另一台' } } };
    l.tables.instances.i.x = 20;
    r.tables.instances.i.y = 40;
    const m = mergeStates(b, l, r);
    assert.equal(m.unresolved.length, 2);
    assert(m.conflicts.some(c => c.field === '文字與格式'));
    assert(m.conflicts.some(c => c.field === '位置'));
    const choices = Object.fromEntries(m.conflicts.map(c => [c.id, c.field === '文字與格式' ? 'remote' : 'local'])), resolved = mergeStates(b, l, r, choices);
    assert.equal(resolved.unresolved.length, 0);
    assert.equal(resolved.state.tables.contents.one.text.body, '另一台');
    assert.deepEqual(resolved.state.tables.contents.one.text.document, { root: { text: '另一台' } });
    assert.equal(resolved.state.tables.instances.i.x, 20);
    assert.equal(resolved.state.tables.instances.i.y, 2);
});
test('trashing a board versus editing its card is explicit and retaining keeps the content visible', () => {
    const b = base(), l = structuredClone(b), r = structuredClone(b);
    l.tables.meta['board:a'] = { isTrashed: true };
    r.tables.contents.one.text.body = '不能遺失';
    const m = mergeStates(b, l, r);
    const c = m.conflicts.find(c => c.field === '刪除與內容修改');
    assert(c);
    const keep = mergeStates(b, l, r, { [c.id]: 'remote' });
    assert.equal(keep.state.tables.meta['board:a'].isTrashed, false);
    assert.equal(keep.state.tables.contents.one.text.body, '不能遺失');
    assert(keep.state.tables.instances.i);
});
test('merged state roundtrips the actual SQLite schema without altering either source', async () => {
    const b = base(), l = structuredClone(b), r = structuredClone(b);
    l.tables.contents.one.text.body = '保留本機';
    r.tables.contents.two.text.body = '保留遠端';
    const m = mergeStates(b, l, r), root = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-merge-db-')), file = path.join(root, 'workspace.sqlite3'), db = new WorkspaceDatabase(file);
    db.close();
    try {
        writeState(file, m.state);
        assert.equal(stateDigest(readState(file)), stateDigest(m.state));
        assert.equal(l.tables.contents.two.text.body, '另一張');
        assert.equal(r.tables.contents.one.text.body, '原文');
    }
    finally {
        await fs.rm(root, { recursive: true, force: true });
    }
});
test('removing a card placement versus editing its shared content requires a decision', () => {
    const b = base(), l = structuredClone(b), r = structuredClone(b);
    delete l.tables.instances.i;
    r.tables.contents.one.text.body = '仍在編輯的中文';
    const m = mergeStates(b, l, r), c = m.conflicts.find(c => c.field === '刪除與內容修改');
    assert(c);
    const resolved = mergeStates(b, l, r, { [c.id]: 'remote' });
    assert.equal(resolved.unresolved.length, 0);
    assert(resolved.state.tables.instances.i);
    assert.equal(resolved.state.tables.contents.one.text.body, '仍在編輯的中文');
    assertSafeState(resolved.state);
});
test('a clean deletion is symmetric and does not resurrect an unchanged card placement', () => {
    const b = base(), l = structuredClone(b), r = structuredClone(b);
    delete r.tables.instances.i;
    assert.equal(mergeStates(b, l, r).state.tables.instances.i, undefined);
    assert.equal(mergeStates(b, r, l).state.tables.instances.i, undefined);
});
test('shared content in two boards still conflicts on the same text; different metadata fields merge', () => {
    const b = base();
    b.tables.instances.j.content_id = 'one';
    b.tables.meta['card:one'].style = { fontSize: 12, color: 'black' };
    const l = structuredClone(b), r = structuredClone(b);
    l.tables.contents.one.text.body = 'A';
    r.tables.contents.one.text.body = 'B';
    l.tables.meta['card:one'].style.fontSize = 18;
    r.tables.meta['card:one'].style.color = 'red';
    const m = mergeStates(b, l, r);
    assert.equal(m.unresolved.length, 1);
    assert.deepEqual({ ...m.state.tables.meta['card:one'].style }, { fontSize: 18, color: 'red' });
});
test('independent hierarchy moves which create a cycle require structural review and can resolve safely', () => {
    const b = base();
    b.tables.meta['whiteboard-instance:wa'] = { id: 'wa', whiteboardId: 'a', containerType: 'folder', containerId: 'f' };
    b.tables.meta['whiteboard-instance:wb'] = { id: 'wb', whiteboardId: 'b', containerType: 'folder', containerId: 'f' };
    b.tables.meta['folder:f'] = { id: 'f', name: '工作' };
    const l = structuredClone(b), r = structuredClone(b);
    Object.assign(l.tables.meta['whiteboard-instance:wa'], { containerType: 'whiteboard', containerId: 'b' });
    Object.assign(r.tables.meta['whiteboard-instance:wb'], { containerType: 'whiteboard', containerId: 'a' });
    const m = mergeStates(b, l, r), c = m.conflicts.find(c => c.field === '循環關聯');
    assert(c);
    const resolved = mergeStates(b, l, r, { [c.id]: 'local' });
    assert.equal(resolved.unresolved.length, 0);
    assertSafeState(resolved.state);
});
test('two offline diaries for one date are preserved with an explicit choice', () => {
    const b = base(), l = structuredClone(b), r = structuredClone(b);
    l.tables.meta['quick-note:one'] = { id: 'one', date: '2026-11-18', isTrashed: false };
    r.tables.meta['quick-note:two'] = { id: 'two', date: '2026-11-18', isTrashed: false };
    const m = mergeStates(b, l, r), c = m.conflicts.find(c => c.field === '同一天的日記');
    assert(c);
    const resolved = mergeStates(b, l, r, { [c.id]: 'remote' });
    assert.equal(resolved.unresolved.length, 0);
    assert(resolved.state.tables.contents.one && resolved.state.tables.contents.two);
    assertSafeState(resolved.state);
});
test('native instance geometry mirrors produce one position conflict and remain consistent after a choice', () => {
    const b = base();
    b.tables.meta['instance:i'] = { id: 'i', x: 1, y: 2, width: 300, height: 200 };
    const l = structuredClone(b), r = structuredClone(b);
    l.tables.instances.i.x = 20;
    l.tables.meta['instance:i'].x = 20;
    r.tables.instances.i.y = 40;
    r.tables.meta['instance:i'].y = 40;
    const m = mergeStates(b, l, r);
    assert.equal(m.unresolved.length, 1);
    const resolved = mergeStates(b, l, r, { [m.conflicts[0].id]: 'remote' });
    assert.equal(resolved.state.tables.meta['instance:i'].x, resolved.state.tables.instances.i.x);
    assert.equal(resolved.state.tables.meta['instance:i'].y, 40);
});
