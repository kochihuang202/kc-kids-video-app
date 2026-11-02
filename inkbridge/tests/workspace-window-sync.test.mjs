import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowExpectations, assertWindowExpectations, projectWindowOperations, advanceWindowBaseline } from '../src/core/workspace-window-sync.mjs';
const fixture = () => ({ revision: 1, boards: [{ id: 'b', title: 'Board', view: { x: 0, y: 0, zoom: 1 } }], contents: [{ id: 'a', document: { root: { children: [] } }, revision: 1 }, { id: 'other', document: { root: { children: [] } }, revision: 1 }], instances: [{ id: 'i', contentId: 'a', boardId: 'b', x: 40, y: 50, width: 300, height: 200, z: 0, attributes: { color: '#fff' } }], cardMetadata: [{ id: 'a', lastEditedTime: 'old' }] });
test('unrelated changes do not block a stale workspace revision, but same-record edits do', () => {
    const base = fixture(), op = { type: 'putContent', data: { ...base.contents[0], document: { root: { children: [{ text: 'draft' }] } } } }, expected = windowExpectations(base, [op]), current = fixture();
    current.revision = 8;
    current.contents[1].revision = 3;
    assert.doesNotThrow(() => assertWindowExpectations(current, [op], expected));
    current.contents[0].revision = 2;
    assert.throws(() => assertWindowExpectations(current, [op], expected), { code: 'WORKSPACE_CONFLICT' });
});
test('instance coordinates and instance attributes have separate preconditions', () => {
    const graph = fixture(), move = { type: 'putInstance', data: { ...graph.instances[0], x: 90 } }, expected = windowExpectations(graph, [move]);
    graph.instances[0].attributes.color = '#123';
    assert.doesNotThrow(() => assertWindowExpectations(graph, [move], expected));
    graph.instances[0].x = 70;
    assert.throws(() => assertWindowExpectations(graph, [move], expected), { code: 'WORKSPACE_CONFLICT' });
});
test('board writes include supplied attributes because real SQLite putBoard writes them', () => {
    const base = fixture();
    base.boards[0].attributes = { color: 'red' };
    const op = { type: 'putBoard', data: { ...base.boards[0], view: { x: 20, y: 20, zoom: 1 } } }, expected = windowExpectations(base, [op]), changed = structuredClone(base);
    changed.boards[0].attributes.color = 'blue';
    assert.throws(() => assertWindowExpectations(changed, [op], expected), { code: 'WORKSPACE_CONFLICT' });
    assert.equal(projectWindowOperations(changed, [op]).boards[0].attributes.color, 'red');
    assert.equal(projectWindowOperations(changed, [{ type: 'putBoard', data: { id: 'b', title: 'Board', view: op.data.view } }]).boards[0].attributes.color, 'blue');
});
test('ACK advances only written records and generated card metadata, never unseen changes', () => {
    const base = fixture(), saved = fixture();
    saved.revision = 5;
    saved.contents[0].revision = 2;
    saved.contents[1].revision = 4;
    saved.cardMetadata[0].lastEditedTime = 'new';
    const next = advanceWindowBaseline(base, saved, [{ type: 'putContent', data: base.contents[0] }]);
    assert.equal(next.contents[0].revision, 2);
    assert.equal(next.contents[1].revision, 1);
    assert.equal(next.cardMetadata[0].lastEditedTime, 'new');
    assert.equal(base.contents[0].revision, 1);
});
test('group projection retains parent-relative coordinates and does not mutate the source graph', () => {
    const base = fixture(), next = projectWindowOperations(base, [{ type: 'putCatalog', kind: 'section', data: { id: 'g', x: 100, y: 200, whiteboardId: 'b' } }, { type: 'putCatalog', kind: 'instance', data: { id: 'i', parentId: 'g' } }, { type: 'putInstance', data: { ...base.instances[0], x: 30, y: 40 } }]);
    assert.equal(next.instances[0].attributes.parentId, 'g');
    assert.equal(next.instances[0].x, 30);
    assert.equal(next.sections[0].x, 100);
    assert.equal(base.instances[0].x, 40);
});
test('missing preconditions and trashed content cannot silently overwrite current state', () => {
    const base = fixture(), op = { type: 'putContent', data: base.contents[0] };
    assert.throws(() => assertWindowExpectations(base, [op], []));
    base.cardMetadata[0].isTrashed = true;
    assert.throws(() => assertWindowExpectations(base, [op], windowExpectations(base, [op])), { code: 'NOTE_UNAVAILABLE' });
});
test('projection follows the real beginId/endId connection cascade, including connections to edges', () => {
    const base = fixture();
    base.connections = [{ id: 'e1', beginId: 'i', endId: 'other' }, { id: 'e2', beginId: 'e1', endId: 'other' }, { id: 'keep', beginId: 'x', endId: 'y' }];
    assert.deepEqual(projectWindowOperations(base, [{ type: 'deleteInstance', id: 'i' }]).connections.map(row => row.id), ['keep']);
    assert.deepEqual(projectWindowOperations(base, [{ type: 'deleteCatalog', kind: 'connection', id: 'e1' }]).connections.map(row => row.id), ['keep']);
    assert.equal(base.connections.length, 3);
});
test('independent automatic height measurements are derived layout, not a conflicting manual move',()=>{
 const base=fixture(),op={type:'putInstance',data:{...base.instances[0],height:230}},expected=windowExpectations(base,[op]),current=fixture();current.instances[0].height=210;
 assert.doesNotThrow(()=>assertWindowExpectations(current,[op],expected));
 current.instances[0].attributes.isAutoHeight=false;assert.throws(()=>assertWindowExpectations(current,[op],expected),{code:'WORKSPACE_CONFLICT'});
 current.instances[0].attributes.isAutoHeight=true;current.instances[0].x=90;assert.throws(()=>assertWindowExpectations(current,[op],expected),{code:'WORKSPACE_CONFLICT'});
});
