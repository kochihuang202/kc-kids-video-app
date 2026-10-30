const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { WorkspaceDatabase } = require('../src/main/database.cjs');
const { createDatabaseClient } = require('../src/main/database-client.cjs');

const lexical = text => ({ root: { type: 'root', version: 1, children: [{ type: 'paragraph', version: 1, children: [{ type: 'text', version: 1, text, format: 1, detail: 0, mode: 'normal', style: '' }], direction: null, format: '', indent: 0, textFormat: 0, textStyle: '' }], direction: null, format: '', indent: 0 } });
const content = (body = '中文 IME 完整內容') => ({ id: 'content-shared', title: '共同筆記', body, document: lexical(body), kind: 'text', tone: 'sage' });
const instance = (id, boardId = 'board-main', x = 20, y = 40) => ({ id, contentId: 'content-shared', boardId, x, y, width: 260, height: 178, z: 1 });
const request = (baseRevision, operations, requestId = crypto.randomUUID()) => ({ requestId, baseRevision, operations });
async function filename() { return path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-database-')), 'workspace.sqlite3'); }

test('committed Lexical JSON reopens with shared content and independently movable instances', async () => {
  const file = await filename(); let store = new WorkspaceDatabase(file);
  const fresh = store.load(); assert.equal(fresh.revision, 0); assert.deepEqual(fresh.contents, []); assert.equal(fresh.boards[0].id, 'board-main');
  const ack = store.commit(request(0, [
    { type: 'putBoard', data: { id: 'board-two', title: '第二白板', view: { x: 0, y: 0, zoom: .5 } } },
    { type: 'putContent', data: { ...content(), revision: 9999 } },
    { type: 'putInstance', data: instance('instance-a') },
    { type: 'putInstance', data: instance('instance-b', 'board-two', 400, 500) }
  ]));
  assert.equal(ack.revision, 1); assert.equal(ack.contentRevisions['content-shared'], 1);
  store.commit(request(1, [{ type: 'putInstance', data: instance('instance-a', 'board-main', -125, 24) }]));
  store.close(); store = new WorkspaceDatabase(file);
  try {
    const loaded = store.load(); assert.equal(loaded.workspaceId, fresh.workspaceId); assert.equal(loaded.revision, 2);
    assert.deepEqual(loaded.contents[0].document, lexical('中文 IME 完整內容'));
    assert.equal(loaded.instances.find(i => i.id === 'instance-a').x, -125);
    assert.equal(loaded.instances.find(i => i.id === 'instance-b').x, 400);
    assert.equal(loaded.contents.length, 1); assert.equal(loaded.instances.length, 2);
  } finally { store.close(); }
});

test('no-op commits keep logical revision, and deleting one instance preserves shared content', async () => {
  const store = new WorkspaceDatabase(await filename());
  try {
    const operations = [{ type: 'putContent', data: content() }, { type: 'putInstance', data: instance('instance-a') }, { type: 'putInstance', data: instance('instance-b') }];
    store.commit(request(0, operations));
    const noop = store.commit(request(1, operations)); assert.equal(noop.changed, false); assert.equal(noop.revision, 1);
    const updated = store.commit(request(1, [{ type: 'putContent', data: content('更新內容') }, { type: 'deleteInstance', id: 'instance-a' }]));
    assert.equal(updated.contentRevisions['content-shared'], 2);
    const graph = store.load(); assert.equal(graph.contents.length, 1); assert.equal(graph.instances[0].id, 'instance-b');
    assert.equal(graph.contents[0].body, '更新內容');
  } finally { store.close(); }
});

test('stale revisions fail without overwriting newer content', async () => {
  const store = new WorkspaceDatabase(await filename());
  try {
    store.commit(request(0, [{ type: 'putContent', data: content('新版') }]));
    assert.throws(() => store.commit(request(0, [{ type: 'putContent', data: content('舊版') }])), { code: 'STALE_REVISION' });
    assert.equal(store.load().contents[0].body, '新版'); assert.equal(store.load().revision, 1);
  } finally { store.close(); }
});

test('foreign-key and invalid operation failures rollback the entire commit and receipt', async () => {
  const store = new WorkspaceDatabase(await filename());
  try {
    const id = crypto.randomUUID();
    assert.throws(() => store.commit(request(0, [{ type: 'putContent', data: content() }, { type: 'putInstance', data: { ...instance('bad'), contentId: 'missing' } }], id)), /FOREIGN KEY/);
    assert.deepEqual(store.load().contents, []); assert.equal(store.load().revision, 0);
    const retry = store.commit(request(0, [{ type: 'putContent', data: content('成功重試') }], id));
    assert.equal(retry.revision, 1);
    assert.throws(() => store.commit(request(1, [{ type: 'putContent', data: content('不能部分寫入') }, { type: 'unknown' }])), { code: 'INVALID_REQUEST' });
    assert.equal(store.load().contents[0].body, '成功重試'); assert.equal(store.load().revision, 1);
    assert.throws(() => store.commit(request(1, [{ type: 'putInstance', data: { ...instance('bad'), x: Infinity } }])), { code: 'INVALID_REQUEST' });
  } finally { store.close(); }
});

test('idempotent retries return the same ACK even after a newer commit; changed payload cannot reuse an ID', async () => {
  const store = new WorkspaceDatabase(await filename());
  try {
    const original = request(0, [{ type: 'putContent', data: content() }]); const ack = store.commit(original);
    store.commit(request(1, [{ type: 'putContent', data: content('第二版') }]));
    assert.deepEqual(store.commit(original), ack); assert.equal(store.load().revision, 2);
    assert.throws(() => store.commit({ ...original, operations: [{ type: 'putContent', data: content('不同內容') }] }), { code: 'REQUEST_ID_REUSED' });
  } finally { store.close(); }
});

test('worker ACK is visible through an independent readonly SQLite connection before worker close', async () => {
  const file = await filename(); const client = createDatabaseClient({ filename: file });
  try {
    const graph = await client.load();
    const ack = await client.commit(request(graph.revision, [{ type: 'putContent', data: content() }, { type: 'putInstance', data: instance('worker-instance') }]));
    const observer = new DatabaseSync(file, { readOnly: true });
    try {
      assert.equal(observer.prepare('SELECT body FROM contents WHERE id=?').get('content-shared').body, '中文 IME 完整內容');
      assert.equal(Number(observer.prepare("SELECT value FROM meta WHERE key='revision'").get().value), ack.revision);
      assert.equal(observer.prepare('PRAGMA journal_mode').get().journal_mode, 'delete');
      assert.equal(observer.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    } finally { observer.close(); }
    assert.equal((await client.load()).instances.length, 1);
  } finally { await client.close(); await client.close(); }
  await assert.rejects(client.load(), { code: 'DATABASE_CLOSED' });
});

test('worker failures reject callers and unrelated SQLite files are not mutated', async () => {
  const file = await filename(); const unrelated = new DatabaseSync(file); unrelated.exec('CREATE TABLE private_data(value TEXT); INSERT INTO private_data VALUES(\'unchanged\')'); unrelated.close();
  const before = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
  const client = createDatabaseClient({ filename: file });
  await assert.rejects(client.load(), { code: 'UNRECOGNIZED_DATABASE' }); await client.close();
  assert.equal(crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'), before);
});

test('requests accepted before close drain in order; malformed data does not poison the worker', async () => {
  const client = createDatabaseClient({ filename: await filename() });
  const loaded = client.load();
  const committed = client.commit(request(0, [{ type: 'putContent', data: content() }]));
  const closed = client.close();
  assert.equal((await loaded).revision, 0); assert.equal((await committed).revision, 1); await closed;
  const other = createDatabaseClient({ filename: await filename() });
  try {
    await assert.rejects(other.commit(request(0, [{ type: 'putContent', data: { ...content(), document: { root: { type: 'wrong', children: [] } } } }])), { code: 'INVALID_REQUEST' });
    assert.equal((await other.commit(request(0, [{ type: 'putContent', data: content('worker still works') }]))).revision, 1);
  } finally { await other.close(); }
});

test('identifier keys cannot change the ACK prototype, and direct close is idempotent', async () => {
  const store = new WorkspaceDatabase(await filename());
  const ack = store.commit(request(0, [{ type: 'putContent', data: { ...content(), id: '__proto__' } }]));
  assert.equal(Object.getPrototypeOf(ack.contentRevisions), Object.prototype);
  assert.equal(Object.hasOwn(ack.contentRevisions, '__proto__'), true);
  assert.equal(ack.contentRevisions.__proto__, 1);
  store.close(); store.close();
  assert.throws(() => store.load(), { code: 'DATABASE_CLOSED' });
});
