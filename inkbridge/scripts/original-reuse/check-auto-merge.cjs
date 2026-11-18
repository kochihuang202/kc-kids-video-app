// Real Electron, isolated A/B workspaces. Exercise editors, refresh, review,
// durable choices, stale choices and both-parent continuation through real IPC.
const { _electron, expect } = require('@playwright/test'), assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { createDatabaseClient } = require('../../src/main/database-client.cjs'), { WorkspaceDatabase } = require('../../src/main/database.cjs'), { createSyncSnapshots } = require('../../src/main/sync-snapshots.cjs'), { stageRestore, switchRestore } = require('../../src/main/workspace-restore.cjs'), { createStorageSettings } = require('../../src/main/storage-settings.cjs');
const note = (id, body) => ({ type: 'putContent', data: { id, title: id === 'one' ? '共同卡片' : '另一張卡片', body, document: null, kind: 'text', tone: 'sage' } });
(async () => {
    const a = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-auto-merge-')), b = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-peer-merge-')), exchange = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-auto-merge-exchange-'));
    await fs.mkdir(path.join(a, 'Profile'));
    await fs.mkdir(path.join(b, 'Profile'));
    const filename = path.join(a, 'Workspace/inkbridge.sqlite3'), seed = new WorkspaceDatabase(filename);
    seed.commit({ requestId: crypto.randomUUID(), baseRevision: 0, operations: [note('one', '共同原文'), note('two', '第二張原文'), { type: 'putInstance', data: { id: 'i-one', contentId: 'one', boardId: 'board-main', x: 30, y: 30, width: 400, height: 220, z: 0 } }, { type: 'putInstance', data: { id: 'i-two', contentId: 'two', boardId: 'board-main', x: 500, y: 30, width: 400, height: 220, z: 1 } }] });
    seed.close();
    let dbA = createDatabaseClient({ filename }), dbB;
    const snapshotsA = createSyncSnapshots({ localDirectory: a, database: dbA, getExchange: () => exchange, resolveAttachment: () => { }, deviceName: '公司電腦' });
    const common = await snapshotsA.create();
    await switchRestore({ local: b, staged: await stageRestore({ local: b, exchange, workspaceId: common.workspaceId, snapshotId: common.snapshotId, snapshots: snapshotsA }), snapshots: { adopt: async () => { } } });
    dbB = createDatabaseClient({ filename: path.join(b, 'Workspace/inkbridge.sqlite3') });
    const remoteFacade = { load: () => dbB.load(), summary: () => dbB.summary(), snapshot: p => dbB.snapshot(p) }, snapshotsB = createSyncSnapshots({ localDirectory: b, database: remoteFacade, getExchange: () => exchange, resolveAttachment: () => { }, deviceName: '家裡電腦' });
    await snapshotsB.adopt(await snapshotsA.manifest(common.workspaceId, common.snapshotId));
    // Different cards on divergent published branches must join at startup.
    await dbA.commit({ requestId: crypto.randomUUID(), baseRevision: 1, operations: [note('one', '公司開機前修改')] });
    await snapshotsA.create();
    await dbA.close();
    async function remote(operations) { const g = await dbB.load(); await dbB.commit({ requestId: crypto.randomUUID(), baseRevision: g.revision, operations }); return snapshotsB.create(); }
    await remote([note('two', '家裡開機前修改')]);
    createStorageSettings({ filename: path.join(a, 'Profile/storage-settings.json'), localDirectory: a, applicationDirectory: path.resolve(__dirname, '../..') }).save(exchange);
    const env = { ...process.env, INKBRIDGE_ORIGINAL_VIEW: 'board', INKBRIDGE_ORIGINAL_PROBE_DATA: a };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.INKBRIDGE_PORTABLE;
    const build = process.env.INKBRIDGE_TEST_BUILD;
    const launch = () => _electron.launch({ args: [build ? path.join(build, 'app/scripts/original-reuse/host.cjs') : path.join(__dirname, 'host.cjs')], executablePath: build ? path.join(build, 'runtime/electron.exe') : require('electron'), env });
    let app = await launch(), page;
    const ready = async () => { page = await app.firstWindow(); page.setDefaultTimeout(20000); await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready, {}, { timeout: 45000 }); };
    const load = () => page.evaluate(() => window.inkbridge.load());
    async function follow() { const status = await snapshotsB.startup(); if (status.kind === 'newer') {
        const staged = await stageRestore({ local: b, exchange, workspaceId: status.workspaceId, snapshotId: status.candidate.snapshotId, snapshots: snapshotsB });
        await dbB.close();
        await switchRestore({ local: b, staged, snapshots: snapshotsB });
        dbB = createDatabaseClient({ filename: path.join(b, 'Workspace/inkbridge.sqlite3') });
    } }
    async function openEditor() { await page.evaluate(() => window.inkbridge.openNoteWindow({ cardId: 'one' })); await expect.poll(() => app.windows().length).toBe(2); const child = app.windows().find(w => w !== page); await child.waitForFunction(() => window.__inkbridgeStandalone?.ready); return child; }
    async function edit(child, value) { const editor = child.locator('[contenteditable=true]'); await editor.click(); await child.keyboard.press('Control+a'); await child.keyboard.insertText(value); }
    async function review() { await page.bringToFront(); await page.locator('#onedrive-save-indicator').click(); const button = page.getByRole('button', { name: '處理衝突', exact: true }); await expect(button).toBeVisible(); await button.click(); await expect(page.locator('#sync-merge-dialog')).toBeVisible(); }
    try {
        await ready();
        let g = await load();
        assert.equal(g.contents.find(c => c.id === 'one').body, '公司開機前修改');
        assert.equal(g.contents.find(c => c.id === 'two').body, '家裡開機前修改');
        const native = await app.browserWindow(page).then(w => w.evaluate(b => b.getNativeWindowHandle().toString('hex')));
        await follow();
        let child = await openEditor();
        // Last unflushed Chinese and a different card edit merge in the same windows.
        await edit(child, '最後一筆尚未按保存的中文');
        await remote([note('two', '另一台改不同卡片')]);
        await expect.poll(() => load().then(g => g.contents.find(c => c.id === 'two').body).catch(() => null), { timeout: 45000 }).toBe('另一台改不同卡片');
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        await child.waitForFunction(() => window.__inkbridgeStandalone?.ready);
        g = await load();
        assert(g.contents.find(c => c.id === 'one').body.endsWith('最後一筆尚未按保存的中文'));
        assert.equal(app.windows().length, 2);
        assert.equal(await app.browserWindow(page).then(w => w.evaluate(b => b.getNativeWindowHandle().toString('hex'))), native);
        await follow();
        // Same card, text on A and position on B, remains an automatic merge.
        await edit(child, '文字與移動自動合併');
        const rg = await dbB.load(), instance = rg.instances.find(i => i.id === 'i-one');
        await remote([{ type: 'putInstance', data: { ...instance, x: 330, y: 190 } }]);
        await expect.poll(() => load().then(g => g.instances.find(i => i.id === 'i-one').x).catch(() => null), { timeout: 45000 }).toBe(330);
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        await child.waitForFunction(() => window.__inkbridgeStandalone?.ready);
        assert((await load()).contents.find(c => c.id === 'one').body.endsWith('文字與移動自動合併'));
        await follow();
        // Genuine same-text conflict is reviewed instead of silently replaced.
        await page.evaluate(() => window.__inkbridgeServices.call('updateNoteCardInstance', { id: 'i-one', updates: { x: 430, y: 290 } }));
        await edit(child, '這台真正衝突的中文');
        const moved = (await dbB.load()).instances.find(i => i.id === 'i-one');
        await remote([note('one', '另一台真正衝突的中文'), { type: 'putInstance', data: { ...moved, x: 630, y: 390 } }]);
        await expect(page.locator('#onedrive-save-indicator')).toHaveAttribute('aria-label', /項修改需要確認/, { timeout: 45000 });
        assert((await load()).contents.find(c => c.id === 'one').body.endsWith('這台真正衝突的中文'));
        await review();
        await expect(page.locator('#merge-local-preview')).toContainText('這台真正衝突的中文');
        await expect(page.locator('#merge-remote-preview')).toContainText('另一台真正衝突的中文');
        assert.equal(await page.locator('#merge-jump option').count(), 2);
        await page.locator('#merge-use-local').click();
        await expect(page.locator('#merge-title')).toContainText('位置');
        await page.locator('#merge-prev').click();
        await expect(page.locator('#merge-title')).toContainText('文字與格式');
        await page.locator('#merge-next').click();
        await page.locator('#merge-use-local').click();
        await expect(page.locator('#merge-finish')).toBeEnabled();
        await page.locator('#merge-later').click();
        // Reopen the application, resume the saved selection, then introduce a new
        // remote edit: Finish must refresh the decision instead of applying it stale.
        await app.close();
        app = await launch();
        await pageForEntry();
        await page.getByRole('button', { name: '逐項處理衝突', exact: true }).click();
        await expect(page.locator('#merge-finish')).toBeEnabled();
        await remote([note('one', '另一台之後再改的內容')]);
        await page.locator('#merge-finish').click();
        await expect(page.locator('#merge-remote-preview')).toContainText('另一台之後再改的內容');
        await expect(page.locator('#merge-finish')).toBeDisabled();
        await page.screenshot({ path: path.join(a, 'conflict-review.png') });
        await page.locator('#merge-use-remote').click();
        await page.locator('#merge-finish').click().catch(e => { if (!/closed|destroyed|navigation/i.test(e.message))
            throw e; });
        await ready();
        assert.equal((await load()).contents.find(c => c.id === 'one').body, '另一台之後再改的內容');
        assert.equal((await load()).instances.find(i => i.id === 'i-one').x, 430);
        await follow();
        await remote([note('two', '共同合併後繼續編輯')]);
        await expect.poll(() => load().then(g => g.contents.find(c => c.id === 'two').body).catch(() => null), { timeout: 45000 }).toBe('共同合併後繼續編輯');
        const result = { automaticStartup: true, unflushedChinesePreserved: true, differentCardMerge: true, textAndPositionMerge: true, sameNativeWindow: true, multiwindow: true, perItemReview: true, twoConflictsAndNavigation: true, choicesSurviveRestart: true, staleChoiceRejected: true, bothParentContinuation: true, a, b, exchange, packaged: !!build };
        await fs.mkdir(path.resolve(__dirname, '../../release'), { recursive: true });
        await fs.writeFile(path.resolve(__dirname, '../../release/auto-merge-acceptance.json'), JSON.stringify(result, null, 2));
        console.log(JSON.stringify(result));
    }
    catch (error) {
        if (page && !page.isClosed()) {
            console.error(await page.evaluate(() => ({ errors: window.__inkbridgeIntegrated?.errors, notices: window.__inkbridgeLampNotices, entry: document.querySelector('#sync-entry')?.innerText, dialog: document.querySelector('#sync-merge-dialog')?.innerText })).catch(() => ({})));
            await page.screenshot({ path: path.join(a, 'failure.png') }).catch(() => { });
        }
        throw error;
    }
    finally {
        await dbB.close();
        await app.close().catch(() => { });
    }
    async function pageForEntry() { page = await app.firstWindow(); page.setDefaultTimeout(20000); await expect(page.getByRole('button', { name: '逐項處理衝突', exact: true })).toBeVisible({ timeout: 45000 }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
