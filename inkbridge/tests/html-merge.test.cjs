const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { createDatabaseClient } = require('../src/main/database-client.cjs'), { createAttachmentStore } = require('../src/main/attachment-store.cjs'), { createHtmlPages } = require('../src/main/html-pages.cjs'), { createSyncSnapshots } = require('../src/main/sync-snapshots.cjs'), { createSyncMerge } = require('../src/main/sync-merge.cjs'), { stageRestore, switchRestore } = require('../src/main/workspace-restore.cjs');
test('independently imported HTML with identical bytes under different CAS extensions merges, restores and exports both pages', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-html-merge-')), exchange = path.join(root, 'exchange'), a = path.join(root, 'A'), b = path.join(root, 'B'), c = path.join(root, 'C'), nativeFactory = path.resolve(__dirname, '../private-original-editor/html-page-runtime.cjs');
    for (const dir of [a, b, c])
        await fs.mkdir(path.join(dir, 'Profile'), { recursive: true });
    await fs.mkdir(exchange);
    const da = createDatabaseClient({ filename: path.join(a, 'Workspace/inkbridge.sqlite3') }), sa = createAttachmentStore(path.join(a, 'files'), () => ({})), pa = createHtmlPages({ attachments: sa, nativeFactory }), snapA = createSyncSnapshots({ localDirectory: a, database: da, getExchange: () => exchange, resolveAttachment: sa.resolvePath });
    let db, dc;
    try {
        const common = await snapA.create();
        await switchRestore({ local: b, staged: await stageRestore({ local: b, exchange, workspaceId: common.workspaceId, snapshotId: common.snapshotId, snapshots: snapA }), snapshots: { adopt: async () => { } } });
        db = createDatabaseClient({ filename: path.join(b, 'Workspace/inkbridge.sqlite3') });
        const sb = createAttachmentStore(path.join(b, 'files'), () => ({})), pb = createHtmlPages({ attachments: sb, nativeFactory }), snapB = createSyncSnapshots({ localDirectory: b, database: db, getExchange: () => exchange, resolveAttachment: sb.resolvePath });
        await snapB.adopt(await snapA.manifest(common.workspaceId, common.snapshotId));
        async function add(local, client, pages, id, ext) { const source = path.join(local, 'source'); await fs.mkdir(source); await fs.writeFile(path.join(source, 'empty.' + ext), ''); const entry = path.join(source, 'page.html'); await fs.writeFile(entry, `<!doctype html><html><head>${ext === 'css' ? '<link rel="stylesheet" href="empty.css">' : '<script src="empty.js"></script>'}</head><body>${id}</body></html>`); const prepared = await pages.prepare(entry), g = await client.load(); await client.commit({ requestId: crypto.randomUUID(), baseRevision: g.revision, operations: [...prepared.fileRecords.map(data => ({ type: 'putCatalog', kind: 'file', data })), { type: 'putContent', data: { id, title: id, kind: 'html', tone: 'sage', body: '', document: null } }, { type: 'putCatalog', kind: 'card', data: { id, fileId: prepared.file.id, url: prepared.file.pageUrl } }, { type: 'putInstance', data: { id: 'i-' + id, contentId: id, boardId: 'board-main', x: 20, y: 20, width: 600, height: 400, z: 0 } }] }); return prepared; }
        const aa = await add(a, da, pa, 'html-a', 'css'), bb = await add(b, db, pb, 'html-b', 'js');
        await snapA.create();
        await snapB.create();
        const merger = createSyncMerge({ localDirectory: a, snapshots: snapA, getExchange: () => exchange });
        let review = await merger.plan(await snapA.index(), await snapA.status());
        assert.equal(review.conflicts.length, 0);
        for (const conflict of review.conflicts)
            review = await merger.choose({ sessionId: review.sessionId, conflictId: conflict.id, choice: 'remote' });
        assert.equal(review.remaining, 0);
        const merged = await merger.prepare();
        await switchRestore({ local: c, staged: await stageRestore({ local: c, exchange, workspaceId: merged.workspaceId, snapshotId: merged.snapshotId, snapshots: snapA }), snapshots: { adopt: async () => { } } });
        const pc = createHtmlPages({ attachments: createAttachmentStore(path.join(c, 'files'), () => ({})), nativeFactory });
        assert.equal((await pc.resolveUrl(aa.file.pageUrl.replace('page.html', 'empty.css'))).size, 0);
        assert.equal((await pc.resolveUrl(bb.file.pageUrl.replace('page.html', 'empty.js'))).size, 0);
        dc = createDatabaseClient({ filename: path.join(c, 'Workspace/inkbridge.sqlite3') });
        const pkg = await require('../src/main/web-share-export.cjs').exportWebShare({ graph: await dc.load(), rootBoardId: 'board-main', workspaceDirectory: c, projectDirectory: path.resolve(__dirname, '..'), outputDirectory: path.join(root, 'exports'), contentOnly: true, readerBuild: 'merge-test' });
        const manifest = JSON.parse(await fs.readFile(path.join(pkg.directory, 'package-manifest.json')));
        assert(manifest.files.some(f => f.path.endsWith('/empty.css')));
        assert(manifest.files.some(f => f.path.endsWith('/empty.js')));
    }
    finally {
        if (dc)
            await dc.close();
        if (db)
            await db.close();
        await da.close();
        await fs.rm(root, { recursive: true, force: true });
    }
});
