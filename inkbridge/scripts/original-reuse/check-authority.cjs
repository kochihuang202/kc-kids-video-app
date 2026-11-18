// Two actual Electron applications with separate simulated OneDrive caches.
// Delayed delivery keeps B's edits unknown to A when A declares authority.
const { _electron, expect } = require('@playwright/test'), assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { WorkspaceDatabase } = require('../../src/main/database.cjs'), { createDatabaseClient } = require('../../src/main/database-client.cjs'), { createSyncSnapshots } = require('../../src/main/sync-snapshots.cjs'), { stageRestore, switchRestore } = require('../../src/main/workspace-restore.cjs'), { createStorageSettings } = require('../../src/main/storage-settings.cjs');
const { readState } = require('../../src/main/workspace-merge.cjs');
(async () => {
    const a = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-authority-a-')), b = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-authority-b-')), exchangeA = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-authority-cache-a-')), exchangeB = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-authority-cache-b-'));
    await fs.mkdir(path.join(a, 'Profile'));
    await fs.mkdir(path.join(b, 'Profile'));
    const filename = path.join(a, 'Workspace/inkbridge.sqlite3'), seed = new WorkspaceDatabase(filename);
    seed.commit({ requestId: crypto.randomUUID(), baseRevision: 0, operations: [{ type: 'putContent', data: { id: 'one', title: '指定版本驗收', body: '共同原文', kind: 'text', tone: 'sage' } }, { type: 'putInstance', data: { id: 'i-one', contentId: 'one', boardId: 'board-main', x: 30, y: 30, width: 500, height: 220, z: 0 } }] });
    seed.close();
    const db = createDatabaseClient({ filename }), snapshots = createSyncSnapshots({ localDirectory: a, database: db, getExchange: () => exchangeA, resolveAttachment: () => { } }), common = await snapshots.create();
    await switchRestore({ local: b, staged: await stageRestore({ local: b, exchange: exchangeA, workspaceId: common.workspaceId, snapshotId: common.snapshotId, snapshots }), snapshots: { adopt: async () => { } } });
    const state = JSON.parse(await fs.readFile(path.join(a, 'Profile/snapshot-state.json')));
    state.deviceId = crypto.randomUUID();
    for (const value of Object.values(state.heads))
        value.adopted = true;
    await fs.writeFile(path.join(b, 'Profile/snapshot-state.json'), JSON.stringify(state));
    await db.close();
    await fs.cp(exchangeA, exchangeB, { recursive: true, force: false });
    for (const [local, exchange] of [[a, exchangeA], [b, exchangeB]])
        createStorageSettings({ filename: path.join(local, 'Profile/storage-settings.json'), localDirectory: local, applicationDirectory: path.resolve(__dirname, '../..') }).save(exchange);
    const build = process.env.INKBRIDGE_TEST_BUILD;
    async function launch(data) { const env = { ...process.env, INKBRIDGE_ORIGINAL_VIEW: 'board', INKBRIDGE_ORIGINAL_PROBE_DATA: data }; delete env.ELECTRON_RUN_AS_NODE; delete env.INKBRIDGE_PORTABLE; const app = await _electron.launch({ args: [build ? path.join(build, 'app/scripts/original-reuse/host.cjs') : path.join(__dirname, 'host.cjs')], executablePath: build ? path.join(build, 'runtime/electron.exe') : require('electron'), env }); const page = await app.firstWindow(); page.setDefaultTimeout(20000); await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready, {}, { timeout: 45000 }); return { app, page }; }
    let A, B;
    async function closePeer(peer){
        if(!peer||peer.closed||peer.app.process().exitCode!==null)return;
        const closed=peer.app.waitForEvent('close',{timeout:45000}),window=await peer.app.browserWindow(peer.page);
        await Promise.all([closed,window.evaluate(w=>w.close())]);peer.closed=true;
    }
    const graph = peer => peer.page.evaluate(() => window.inkbridge.load());
    const head = async (local) => JSON.parse(await fs.readFile(path.join(local, 'Profile/snapshot-state.json'))).heads[common.workspaceId];
    async function editor(peer) { await peer.page.evaluate(() => window.inkbridge.openNoteWindow({ cardId: 'one' })); await expect.poll(() => peer.app.windows().length).toBe(2); const child = peer.app.windows().find(p => p !== peer.page); await child.waitForFunction(() => window.__inkbridgeStandalone?.ready); return child; }
    async function edit(child, value) { await child.bringToFront(); await child.locator('[contenteditable=true]').click(); await child.keyboard.press('Control+a'); await child.keyboard.insertText(value); }
    try {
        A = await launch(a);
        B = await launch(b);
        const ac = await editor(A), bc = await editor(B), native = await B.app.browserWindow(B.page).then(w => w.evaluate(b => b.getNativeWindowHandle().toString('hex')));
        await edit(bc, '另一台尚未同步的最後中文');
        await edit(ac, '本機指定的最後中文');
        await expect.poll(() => graph(B).then(g => g.contents[0].body)).toContain('另一台尚未同步的最後中文');
        await A.page.bringToFront();
        await A.page.locator('#footer-settings').click();
        await A.page.getByRole('tab', { name: '本地存儲與備份', exact: true }).click();
        const button = A.page.getByRole('button', { name: '以這台為準，讓其他電腦對齊', exact: true });
        await expect(button).toBeVisible();
        await button.scrollIntoViewIfNeeded();
        await A.page.screenshot({ path: path.join(a, 'authority-button.png') });
        await button.click();
        await expect(A.page.locator('#authority-local-status')).toContainText('已指定這台的內容為準', { timeout: 30000 });
        const chosen = await head(a);
        assert(chosen.authorityId);
        const official = (await graph(A)).contents[0].body;
        assert(official.endsWith('本機指定的最後中文'));
        assert((await graph(B)).contents[0].body.endsWith('另一台尚未同步的最後中文'));
        await fs.cp(exchangeA, exchangeB, { recursive: true, force: false });
        await expect.poll(() => graph(B).then(g => g.contents[0].body).catch(() => null), { timeout: 45000 }).toBe(official);
        await B.page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        await bc.waitForFunction(() => window.__inkbridgeStandalone?.ready);
        assert.equal(B.app.windows().length, 2);
        assert.equal(await B.app.browserWindow(B.page).then(w => w.evaluate(b => b.getNativeWindowHandle().toString('hex'))), native);
        await expect(bc.locator('[contenteditable=true]')).toContainText('本機指定的最後中文');
        assert.equal((await head(b)).authorityId, chosen.authorityId);
        let backup = null;
        const dir = path.join(exchangeB, 'snapshots', common.workspaceId);
        for (const name of await fs.readdir(dir)) {
            if (!/^[a-f0-9-]{36}$/.test(name))
                continue;
            const file = path.join(dir, name, 'database.sqlite3');
            const state = readState(file);
            if (state.tables.contents.one.text.body.endsWith('另一台尚未同步的最後中文'))
                backup = name;
        }
        assert(backup, 'B must keep its previously unpublished final Chinese as a complete immutable checkpoint');
        const revision = (await graph(B)).revision;
        await B.page.evaluate(() => window.inkbridge.sync({ method: 'check' }));
        await B.page.evaluate(() => window.inkbridge.sync({ method: 'check' }));
        assert.equal((await graph(B)).revision, revision);
        await edit(bc, '對齊後正常的新編輯');
        await bc.keyboard.press('Control+s');
        await B.page.evaluate(() => window.inkbridge.createSnapshot());
        assert.equal((await head(b)).authorityId, chosen.authorityId);
        await fs.cp(exchangeB, exchangeA, { recursive: true, force: false });
        await expect.poll(() => graph(A).then(g => g.contents[0].body).catch(() => null), { timeout: 45000 }).toContain('對齊後正常的新編輯');
        assert.equal((await head(a)).authorityId, chosen.authorityId);
        assert.equal(await B.page.locator('#sync-merge-dialog').count(), 0);
        await A.page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);await ac.waitForFunction(()=>window.__inkbridgeStandalone?.ready);await B.page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);await bc.waitForFunction(()=>window.__inkbridgeStandalone?.ready);
        // Use the actual main-window close path, not app.quit closing every
        // child concurrently while the refreshed main frame is initializing.
        await closePeer(B);await closePeer(A);
        const result = { actualSettingsButton: true, twoElectronApps: true, separateOneDriveCaches: true, unpublishedChineseBackedUp: true, automaticAlignment: true, sameNativeWindow: true, multiwindowPreserved: true, authorityAppliedOnce: true, futureEditsSyncNormally: true, oldBackupDoesNotResurrect: true,normalMainWindowClose:true, authorityId: chosen.authorityId, backup, a, b, exchangeA, exchangeB, packaged: !!build };
        await fs.writeFile(path.resolve(__dirname, '../../release/authority-acceptance.json'), JSON.stringify(result, null, 2));
        console.log(JSON.stringify(result));
    }
    catch (error) {
        for (const [peer, local] of [[A, a], [B, b]])
            if (peer?.page && !peer.page.isClosed()) {
                console.error(await peer.page.evaluate(() => ({ errors: window.__inkbridgeIntegrated?.errors, entry: document.querySelector('#sync-entry')?.innerText, notices: window.__inkbridgeLampNotices })).catch(() => ({})));
                await peer.page.screenshot({ path: path.join(local, 'failure.png') }).catch(() => { });
            }
        throw error;
    }
    finally {
        for(const peer of [B,A])if(peer&&!peer.closed){try{await closePeer(peer);}catch(error){peer.app.process().kill();console.error('Isolated test close failed:',error.message);process.exitCode=1;}}
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
