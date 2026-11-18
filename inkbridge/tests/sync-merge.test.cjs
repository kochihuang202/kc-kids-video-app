const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { createDatabaseClient } = require('../src/main/database-client.cjs'), { createSyncSnapshots } = require('../src/main/sync-snapshots.cjs'), { createSyncMerge } = require('../src/main/sync-merge.cjs'), { stageRestore, switchRestore } = require('../src/main/workspace-restore.cjs');
const note = (id, body) => ({ type: 'putContent', data: { id, title: id, body, kind: 'text', tone: 'sage' } });
test('explicit authority aligns once, preserves unpublished edits and excludes late old-generation backups from future merges',async()=>{
 const f=await fixture();try{
  await f.a.edit([note('one','指定這台的內容')]);await f.a.snapshots.create();await f.b.edit([note('two','另一台尚未同步的內容')]);
  const sent=await f.a.snapshots.create('authoritative-local',{force:true,authoritative:true}),m=await f.a.snapshots.manifest(sent.workspaceId,sent.snapshotId),decide=require('../src/main/snapshot-authority.cjs').authorityDecision;
  assert.equal(m.authorityId,m.snapshotId);assert.equal(m.isAuthoritative,true);assert.equal(decide(await f.b.snapshots.index(),await f.b.snapshots.status()).candidate.snapshotId,m.snapshotId);
  const backup=await f.b.snapshots.create('before-authority-align');await f.b.apply(m);assert.equal((await f.b.load()).contents.find(c=>c.id==='two').body,'原文二');assert.equal((await f.b.snapshots.readMergeState(backup.snapshotId)).state.tables.contents.two.text.body,'另一台尚未同步的內容');assert.equal((await f.b.snapshots.startup()).kind,'current');
  await fs.rm(path.join(f.exchange,'snapshots',backup.workspaceId,backup.snapshotId),{recursive:true});await f.b.snapshots.flushOutbox();assert.equal((await f.b.snapshots.index()).find(r=>r.snapshotId===backup.snapshotId).relation,'authority-backup');assert.equal(await f.b.merge.plan(await f.b.snapshots.index(),await f.b.snapshots.status()),null);
  await f.b.edit([note('two','對齊後的新編輯')]);const saved=await f.b.snapshots.create(),next=await f.b.snapshots.manifest(saved.workspaceId,saved.snapshotId);assert.equal(next.authorityId,m.authorityId);assert.equal((await f.a.snapshots.startup()).candidate.snapshotId,next.snapshotId);await f.a.apply(next);assert.equal((await f.a.load()).contents.find(c=>c.id==='two').body,'對齊後的新編輯');assert.equal(decide(await f.a.snapshots.index(),await f.a.snapshots.status()),null);
 }finally{await f.close();}
});
test('simultaneous authority commands require a new explicit command, never a timestamp winner',async()=>{
 const f=await fixture();try{const a=await f.a.snapshots.create('authoritative-local',{force:true,authoritative:true}),b=await f.b.snapshots.create('authoritative-local',{force:true,authoritative:true}),decide=require('../src/main/snapshot-authority.cjs').authorityDecision;assert.equal(decide(await f.a.snapshots.index(),await f.a.snapshots.status()).kind,'authority-conflict');const next=await f.a.snapshots.create('authoritative-local',{force:true,authoritative:true,resolvedSnapshotIds:[a.snapshotId,b.snapshotId]});const decision=decide(await f.b.snapshots.index(),await f.b.snapshots.status());assert.equal(decision.kind,'authority-align');assert.equal(decision.candidate.snapshotId,next.snapshotId);}finally{await f.close();}
});
test('an incomplete authority and an incoming generation without its authority record never overwrite local data',async()=>{
 const f=await fixture();try{const sent=await f.a.snapshots.create('authoritative-local',{force:true,authoritative:true}),decide=require('../src/main/snapshot-authority.cjs').authorityDecision;await fs.rm(path.join(f.exchange,'snapshots',sent.workspaceId,sent.snapshotId,'database.sqlite3'));assert.equal(decide(await f.b.snapshots.index(),await f.b.snapshots.status()).kind,'incomplete');const id=crypto.randomUUID(),row={workspaceId:sent.workspaceId,snapshotId:crypto.randomUUID(),integrity:'complete',manifest:{authorityId:id,parentSnapshotIds:[id]}};assert.equal(decide([row],await f.b.snapshots.status()).kind,'incomplete');assert.equal((await f.b.load()).contents.find(c=>c.id==='one').body,'原文一');}finally{await f.close();}
});
test('intentionally restoring a pre-authority backup is a new edit in the current authority generation',async()=>{
 const f=await fixture();try{await f.a.edit([note('one','舊備份中文')]);const old=await f.a.snapshots.create();await f.a.edit([note('one','指定版本中文')]);const sent=await f.a.snapshots.create('authoritative-local',{force:true,authoritative:true}),authority=await f.a.snapshots.manifest(sent.workspaceId,sent.snapshotId);await f.b.apply(authority);await f.b.apply(await f.b.snapshots.manifest(old.workspaceId,old.snapshotId));const restored=await f.b.snapshots.create('restore',{force:true,parentSnapshotId:authority.snapshotId,restoredFromSnapshotId:old.snapshotId,authorityId:authority.snapshotId});const m=await f.b.snapshots.manifest(restored.workspaceId,restored.snapshotId);assert.equal(m.authorityId,authority.snapshotId);assert.equal((await f.a.snapshots.startup()).candidate.snapshotId,m.snapshotId);await f.a.apply(m);assert.equal((await f.a.load()).contents.find(c=>c.id==='one').body,'舊備份中文');}finally{await f.close();}
});
test('different boards, independently added cards and distinct title/tone fields survive a real merged SQLite checkpoint', async () => {
    const f = await fixture();
    try {
        const view={x:0,y:0,zoom:1};
        await f.a.edit([{type:'putBoard',data:{id:'second',title:'第二白板',view}}]);
        const common=await f.a.snapshots.create();await f.b.apply(await f.a.snapshots.manifest(common.workspaceId,common.snapshotId));
        const a=(await f.a.load()).contents.find(c=>c.id==='one'),b=(await f.b.load()).contents.find(c=>c.id==='one');
        await f.a.edit([{type:'putBoard',data:{id:'board-main',title:'公司白板',view}},note('new-a','公司新增卡片'),{type:'putInstance',data:{id:'new-ia',contentId:'new-a',boardId:'board-main',x:10,y:10,width:300,height:200,z:0}},{type:'putContent',data:{...a,tone:'rose'}}]);
        await f.b.edit([{type:'putBoard',data:{id:'second',title:'家裡白板',view}},note('new-b','家裡新增卡片'),{type:'putInstance',data:{id:'new-ib',contentId:'new-b',boardId:'second',x:20,y:20,width:300,height:200,z:0}},{type:'putContent',data:{...b,title:'另一台修改標題'}}]);
        await f.a.snapshots.create();await f.b.snapshots.create();
        const review=await f.a.merge.plan(await f.a.snapshots.index(),await f.a.snapshots.status());assert.equal(review.remaining,0);
        await f.a.apply(await f.a.merge.prepare());const graph=await f.a.load();assert.equal(graph.boards.find(b=>b.id==='board-main').title,'公司白板');assert.equal(graph.boards.find(b=>b.id==='second').title,'家裡白板');assert(graph.contents.some(c=>c.id==='new-a')&&graph.contents.some(c=>c.id==='new-b'));const card=graph.contents.find(c=>c.id==='one');assert.equal(card.title,'另一台修改標題');assert.equal(card.tone,'rose');
    } finally {await f.close();}
});
test('unchanged conflict polls reuse the verified plan and changing either head triggers validation again', async () => {
    const f=await fixture();try{
        await f.a.edit([note('one','A')]);await f.b.edit([note('one','B')]);await f.a.snapshots.create();await f.b.snapshots.create();let calls=0;
        const snapshots={...f.a.snapshots,manifest:async(...args)=>{calls++;return f.a.snapshots.manifest(...args);}},merge=createSyncMerge({localDirectory:f.a.local,snapshots,getExchange:()=>f.exchange});
        const first=await merge.plan(await f.a.snapshots.index(),await f.a.snapshots.status());const again=await merge.plan(await f.a.snapshots.index(),await f.a.snapshots.status());assert.equal(again.sessionId,first.sessionId);assert.equal(calls,1);
        await f.b.edit([note('one','B 新內容')]);await f.b.snapshots.create();const changed=await merge.plan(await f.a.snapshots.index(),await f.a.snapshots.status());assert.notEqual(changed.sessionId,first.sessionId);assert.equal(calls,2);
    }finally{await f.close();}
});
async function fixture() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-merge-sync-')), exchange = path.join(root, 'exchange');
    await fs.mkdir(exchange);
    const peers = [];
    async function peer(name) { const local = path.join(root, name); await fs.mkdir(path.join(local, 'Profile'), { recursive: true }); let db = createDatabaseClient({ filename: path.join(local, 'Workspace/inkbridge.sqlite3') }); const facade = { load: () => db.load(), summary: () => db.summary(), snapshot: p => db.snapshot(p) }; const snapshots = createSyncSnapshots({ localDirectory: local, database: facade, getExchange: () => exchange, resolveAttachment: () => { throw Error('no fixture assets'); }, deviceName: name }), merge = createSyncMerge({ localDirectory: local, snapshots, getExchange: () => exchange }); const p = { local, snapshots, merge, load: () => db.load(), async edit(operations) { const graph = await db.load(); return db.commit({ requestId: crypto.randomUUID(), baseRevision: graph.revision, operations }); }, async apply(m) { const staged = await stageRestore({ local, exchange, workspaceId: m.workspaceId, snapshotId: m.snapshotId, snapshots }); await db.close(); try {
            await switchRestore({ local, staged, snapshots });
        }
        finally {
            db = createDatabaseClient({ filename: path.join(local, 'Workspace/inkbridge.sqlite3') });
        } }, close: () => db.close() }; peers.push(p); return p; }
    const a = await peer('公司'), common = await (async () => { await a.edit([note('one', '原文一'), note('two', '原文二')]); const s = await a.snapshots.create(); return a.snapshots.manifest(s.workspaceId, s.snapshotId); })(), b = await peer('家裡');
    await b.apply(common);
    return { root, exchange, a, b, common, async close() { for (const p of peers)
            await p.close(); await fs.rm(root, { recursive: true, force: true }); } };
}
test('real checkpoint merge preserves both edits, has both parents and the other computer continues without a false branch', async () => {
    const f = await fixture();
    try {
        await f.a.edit([note('one', '公司未同步的中文')]);
        await f.b.edit([note('two', '家裡新增內容')]);
        const sa = await f.a.snapshots.create(), sb = await f.b.snapshots.create();
        const review = await f.a.merge.plan(await f.a.snapshots.index(), await f.a.snapshots.status());
        assert.equal(review.remaining, 0);
        const m = await f.a.merge.prepare();
        assert.deepEqual(new Set(m.parentSnapshotIds), new Set([sa.snapshotId, sb.snapshotId]));
        await f.a.apply(m);
        await f.a.merge.completed();
        let graph = await f.a.load();
        assert.equal(graph.contents.find(c => c.id === 'one').body, '公司未同步的中文');
        assert.equal(graph.contents.find(c => c.id === 'two').body, '家裡新增內容');
        assert.equal((await f.b.snapshots.startup()).candidate.snapshotId, m.snapshotId);
        await f.b.apply(m);
        await f.b.edit([note('two', '接上共同合併版後繼續')]);
        const next = await f.b.snapshots.create();
        assert.equal((await f.a.snapshots.startup()).candidate.snapshotId, next.snapshotId);
        assert.equal((await f.a.snapshots.startup()).hasLocalChanges, false);
        assert.equal((await f.a.snapshots.manifest(sa.workspaceId, sa.snapshotId)).snapshotId, sa.snapshotId);
    }
    finally {
        await f.close();
    }
});
test('conflict decisions survive reopen and a changed local record invalidates stale choices', async () => {
    const f = await fixture();
    try {
        await f.a.edit([note('one', '這台文字')]);
        await f.b.edit([note('one', '另一台文字')]);
        await f.a.snapshots.create();
        await f.b.snapshots.create();
        let review = await f.a.merge.plan(await f.a.snapshots.index(), await f.a.snapshots.status());
        assert.equal(review.remaining, 1);
        review = await f.a.merge.choose({ sessionId: review.sessionId, conflictId: review.conflicts[0].id, choice: 'remote' });
        assert.equal(review.remaining, 0);
        const reopened = createSyncMerge({ localDirectory: f.a.local, snapshots: f.a.snapshots, getExchange: () => f.exchange });
        review = await reopened.plan(await f.a.snapshots.index(), await f.a.snapshots.status());
        assert.equal(review.remaining, 0);
        const prior = review.sessionId;
        await f.a.edit([note('one', '之後又輸入的最後中文')]);
        await f.a.snapshots.create();
        review = await reopened.plan(await f.a.snapshots.index(), await f.a.snapshots.status());
        assert.notEqual(review.sessionId, prior);
        assert.equal(review.remaining, 1);
        await assert.rejects(reopened.prepare(), /逐項/);
        assert.equal((await f.a.load()).contents.find(c => c.id === 'one').body, '之後又輸入的最後中文');
    }
    finally {
        await f.close();
    }
});
test('simultaneous equivalent merges converge and a subsequent child of either merge remains a successor', async () => {
    const f = await fixture();
    try {
        await f.a.edit([note('one', 'A')]);
        await f.b.edit([note('two', 'B')]);
        await f.a.snapshots.create();
        await f.b.snapshots.create();
        await f.a.merge.plan(await f.a.snapshots.index(), await f.a.snapshots.status());
        await f.b.merge.plan(await f.b.snapshots.index(), await f.b.snapshots.status());
        const ma = await f.a.merge.prepare(), mb = await f.b.merge.prepare();
        assert.equal(ma.mergeDigest, mb.mergeDigest);
        await f.a.apply(ma);
        await f.b.apply(mb);
        assert.equal((await f.a.snapshots.startup()).kind, 'current');
        assert.equal((await f.b.snapshots.startup()).kind, 'current');
        await f.b.edit([note('two', 'B 繼續')]);
        const next = await f.b.snapshots.create();
        assert.equal((await f.a.snapshots.startup()).candidate.snapshotId, next.snapshotId);
    }
    finally {
        await f.close();
    }
});
test('retention pins the other computers offline common base and unchanged checks do not rewrite watched device files', async () => {
    const f = await fixture();
    try {
        await f.a.edit([note('one', '新共同基準')]);
        const saved = await f.a.snapshots.create(), base = await f.a.snapshots.manifest(saved.workspaceId, saved.snapshotId);
        await f.b.apply(base);
        for (let i = 0; i < 14; i++) {
            await f.a.edit([note('one', '之後的公司編輯 ' + i)]);
            await f.a.snapshots.create();
        }
        await f.a.snapshots.prune({ workspaceId: saved.workspaceId, force: true });
        assert.equal((await f.a.snapshots.manifest(saved.workspaceId, saved.snapshotId)).snapshotId, saved.snapshotId);
        await f.b.edit([note('two', '離線回來的家裡編輯')]);
        await f.b.snapshots.create();
        const review = await f.a.merge.plan(await f.a.snapshots.index(), await f.a.snapshots.status());
        assert.equal(review.remaining, 0);
        const dir = path.join(f.exchange, 'sync-devices', saved.workspaceId), name = (await fs.readdir(dir))[0], file = path.join(dir, name), old = new Date('2020-01-01T00:00:00Z');
        await fs.utimes(file, old, old);
        await f.a.snapshots.flushOutbox();
        await f.b.snapshots.flushOutbox();
        assert.equal((await fs.stat(file)).mtimeMs, old.getTime());
    }
    finally {
        await f.close();
    }
});
test('a missing common payload does not authorise a guessed merge or change either working database', async () => {
    const f = await fixture();
    try {
        await f.a.edit([note('one', '保留A')]);
        await f.b.edit([note('two', '保留B')]);
        await f.a.snapshots.create();
        await f.b.snapshots.create();
        await fs.rm(path.join(f.exchange, 'snapshots', f.common.workspaceId, f.common.snapshotId), { recursive: true });
        await fs.rm(path.join(f.a.local, 'Outbox', f.common.snapshotId), { recursive: true });
        await assert.rejects(f.a.merge.plan(await f.a.snapshots.index(), await f.a.snapshots.status()), /共同版本/);
        assert.equal((await f.a.load()).contents.find(c => c.id === 'one').body, '保留A');
        assert.equal((await f.b.load()).contents.find(c => c.id === 'two').body, '保留B');
    }
    finally {
        await f.close();
    }
});
test('failure after adopting a merged snapshot rolls back database, head and merge-base before the next exchange check', async () => {
    const f = await fixture();
    try {
        await f.a.edit([note('one', '回復前保留的本機中文')]);
        await f.b.edit([note('two', '遠端修改')]);
        await f.a.snapshots.create();
        await f.b.snapshots.create();
        await f.a.merge.plan(await f.a.snapshots.index(), await f.a.snapshots.status());
        const m = await f.a.merge.prepare(), head = await fs.readFile(path.join(f.a.local, 'Profile/snapshot-state.json'), 'utf8'), bases = await fs.readFile(path.join(f.a.local, 'Profile/merge-bases.json'), 'utf8'), staged = await stageRestore({ local: f.a.local, exchange: f.exchange, workspaceId: m.workspaceId, snapshotId: m.snapshotId, snapshots: f.a.snapshots });
        await f.a.close();
        await assert.rejects(switchRestore({ local: f.a.local, staged, snapshots: { adopt: async (value) => { await f.a.snapshots.adopt(value); throw Error('injected after-adopt failure'); } } }), /after-adopt/);
        assert.equal(await fs.readFile(path.join(f.a.local, 'Profile/snapshot-state.json'), 'utf8'), head);
        assert.equal(await fs.readFile(path.join(f.a.local, 'Profile/merge-bases.json'), 'utf8'), bases);
        const db = new (require('../src/main/database.cjs').WorkspaceDatabase)(path.join(f.a.local, 'Workspace/inkbridge.sqlite3'));
        try {
            assert.equal(db.load().contents.find(c => c.id === 'one').body, '回復前保留的本機中文');
        }
        finally {
            db.close();
        }
        await f.a.snapshots.flushOutbox();
        const device = JSON.parse(head).deviceId, shared = JSON.parse(await fs.readFile(path.join(f.exchange, 'sync-devices', m.workspaceId, device + '.json')));
        assert.equal(shared.baseSnapshotId, JSON.parse(bases)[m.workspaceId].baseSnapshotId);
    }
    finally {
        await f.close();
    }
});
