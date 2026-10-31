const { _electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
(async () => {
    const root = path.resolve(__dirname, '../..'), data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-')), env = { ...process.env, INKBRIDGE_ORIGINAL_PROBE_DATA: data, INKBRIDGE_ORIGINAL_VIEW: 'board' };
    delete env.ELECTRON_RUN_AS_NODE;
    const launch = () => _electron.launch({ args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env, timeout: 30000 });
    let app = await launch();
    try {
        let page = await app.firstWindow();
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready, {}, { timeout: 30000 });
        const t = key => page.evaluate(key => window.__originalRequire(1643).ag.t(key, { ns: 'common' }), key), load = () => page.evaluate(() => window.inkbridge.load());
        const open = async () => { await page.locator('#original-sidebar-navigation').getByRole('tab', { name: await t('board'), exact: true }).click(); };
        await open();
        let main = page.locator('#original-board-home');
        await main.getByRole('button', { name: await t('newGroup'), exact: true }).click();
        let dialog = page.getByRole('dialog');
        await dialog.locator('input').fill('Dashboard group');
        await dialog.getByRole('button', { name: await t('Submit'), exact: true }).click();
        await expect(main.getByText('Dashboard group', { exact: true })).toBeVisible();
        await main.locator('p').getByText(await t('New Whiteboard'), { exact: true }).click();
        await expect.poll(() => page.evaluate(() => window.__inkbridgeIntegrated.page)).toBe('flow');
        const rename=page.locator('[data-canvas-whiteboard-breadcrumb]').getByRole('textbox',{name:await t('Rename'),exact:true});await expect(rename).toBeVisible();await rename.fill('Dashboard board');await rename.press('Enter');await expect.poll(async()=>(await load()).boards.some(board=>board.title==='Dashboard board')).toBe(true);
        const graph = await load(), group = graph.folders.find(f => f.name === 'Dashboard group'), ref = graph.whiteboardInstances.find(row => row.containerId === group.id), boardId = ref.whiteboardId;
        assert.equal(ref.containerType, 'folder');
        await page.evaluate(() => window.__inkbridgeIntegrated.addCard('Dashboard preserved', 'DASHBOARD_GROUP_RESTORE', { x: 20, y: 20 }));
        await page.evaluate(() => window.__inkbridgeIntegrated.flush());
        const before = await load();
        await open();
        await expect(main.getByText('Dashboard group', { exact: true })).toBeVisible();
        let groupBox = main.locator('[class~="group/folder"]').filter({ hasText: 'Dashboard group' });
        await groupBox.hover();
        await groupBox.getByRole('button', { name: await t('Edit'), exact: true }).click();
        const name = main.getByRole('textbox', { name: await t('groupName'), exact: true });
        await name.fill('Renamed dashboard');
        await name.press('Enter');
        await main.getByRole('button', { name: await t('newGroup'), exact: true }).focus();
        await expect.poll(async () => (await load()).folders.find(f => f.id === group.id).name).toBe('Renamed dashboard');
        groupBox = main.locator('[class~="group/folder"]').filter({ hasText: 'Renamed dashboard' });
        await groupBox.locator(':scope > div').first().getByRole('button').last().click();
        dialog = page.getByRole('dialog');
        await dialog.getByRole('button', { name: await t('Cancel'), exact: true }).click();
        assert((await load()).folders.some(f => f.id === group.id));
        await groupBox.locator(':scope > div').first().getByRole('button').last().click();
        await page.getByRole('dialog').getByRole('button', { name: await t('Delete'), exact: true }).click();
        await expect.poll(async () => (await load()).folders?.length || 0).toBe(0);
        let after = await load();
        assert(after.boards.find(b => b.id === boardId).attributes.isTrashed);
        assert.deepEqual(after.contents, before.contents);
        assert.deepEqual(after.instances, before.instances);
        await page.locator('#open-trash').click();
        await main.getByRole('button', { name: await t('Restore'), exact: true }).click();
        await expect.poll(async () => (await load()).boards.find(b => b.id === boardId).attributes.isTrashed).toBe(false);
        await open();
        await expect(main.getByText(graph.boards.find(b => b.id === boardId).title, { exact: true })).toBeVisible();
        after = await load();
        assert(after.whiteboardInstances.find(row => row.id === ref.id).isTrashed, 'orphaned placement stays trashed so restored board is visible at root');
        assert.deepEqual(after.contents, before.contents);
        assert.deepEqual(after.instances, before.instances);
        await page.screenshot({ path: path.join(root, 'private-original-editor/dashboard-success.png') });
        await app.close();
        app = await launch();
        page = await app.firstWindow();
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready, {}, { timeout: 30000 });
        assert.deepEqual(await load(), after);
        console.log(JSON.stringify({ nativeGroupedCreation: true, inlineGroupRename: true, cancelDelete: true, atomicGroupDelete: true, orphanRestoreVisible: true, contentPreserved: true, exactRestart: true }));
        assert.deepEqual(await page.evaluate(() => window.__inkbridgeIntegrated.errors), []);
    }
    catch (error) {
        const page = await app.firstWindow();
        await page.screenshot({ path: path.join(root, 'private-original-editor/dashboard-failure.png') });
        console.log(await page.locator('#original-board-home').innerText());
        throw error;
    }
    finally {
        await app.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
