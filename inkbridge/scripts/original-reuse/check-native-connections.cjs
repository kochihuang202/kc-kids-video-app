const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { WorkspaceDatabase } = require('../../src/main/database.cjs');
(async () => {
    const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-')), db = new WorkspaceDatabase(path.join(data, 'Workspace/inkbridge.sqlite3')), { noteDocument } = await import('../../src/core/rich-document.mjs');
    db.commit({ requestId: crypto.randomUUID(), baseRevision: 0, operations: ['source', 'target'].flatMap((id, i) => [{ type: 'putContent', data: { id, title: id, body: id, document: noteDocument({ title: id, body: id }), kind: 'text', tone: 'sage' } }, { type: 'putInstance', data: { id: 'instance-' + id, contentId: id, boardId: 'board-main', x: 60 + i * 500, y: 140, width: 240, height: 160, z: i } }, { type: 'putCatalog', kind: 'instance', data: { id: 'instance-' + id, isAutoHeight: false, type: 'NoteCard' } }]) });
    db.close();
    const env = { ...process.env, INKBRIDGE_ORIGINAL_PROBE_DATA: data, INKBRIDGE_ORIGINAL_VIEW: 'board' };
    delete env.ELECTRON_RUN_AS_NODE;
    const launch = () => _electron.launch({ args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env });
    let app = await launch(), page;
    try {
        page = await app.firstWindow();
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        await app.evaluate(({ app }) => app.focus({ steal: true }));
        await page.bringToFront();
        const label = await page.evaluate(() => window.__originalRequire(1643).ag.t('connectingTips', { ns: 'common' }));
        await page.locator('#original-native-tools').getByRole('button', { name: label, exact: true }).click();
        await expect.poll(() => page.evaluate(() => window.__originalRequire(63268).Z.getState().flow.controlMode)).toBe('connect');
        const points = await page.evaluate(() => { const b = document.querySelector('#board').getBoundingClientRect(), s = window.__originalRequire(23).gt.getState(); return s.nodes.map(n => ({ x: b.x + s.view.translateX + (n.position.x + (n.id === 'instance-source' ? 240 : 0)) * s.view.scale, y: b.y + s.view.translateY + (n.position.y + 80) * s.view.scale })); });
        await page.mouse.move(points[0].x - 2, points[0].y);
        await page.mouse.down();
        await page.mouse.move(points[1].x + 2, points[1].y, { steps: 12 });
        await page.mouse.up();
        await page.evaluate(() => window.__inkbridgeIntegrated.flush());
        await expect.poll(async () => ((await page.evaluate(() => window.inkbridge.load())).connections || []).length).toBe(1);
        const graph = await page.evaluate(() => window.inkbridge.load()), edge = graph.connections[0];
        assert.equal(edge.beginId, 'instance-source');
        assert.equal(edge.endId, 'instance-target');
        assert.equal(edge.pathType, 'bezier', 'new connections default to the middle curved option');
        assert.equal(await page.evaluate(()=>window.__originalRequire(23).gt.getState().connections[0].pathType),'bezier','canvas and persisted defaults must agree');
        const links = await page.evaluate(() => window.__inkbridgeServices.call('getCardLinks', { cardId: 'source', cardType: 'NoteCard' }));
        assert.equal(links.whiteboardLinks[0].sourceList[0].targetObject.noteCard.id, 'target');
        assert.equal(links.whiteboardLinks[0].targetList.length, 0);
        const t = key => page.evaluate(key => window.__originalRequire(1643).ag.t(key, { ns: 'common' }), key);
        await page.locator('#original-native-tools').getByRole('button', { name: await t('viewControls.create selection'), exact: true }).click();
        await page.mouse.click((points[0].x + points[1].x) / 2, points[0].y);
        await expect(page.getByRole('button', { name: await t('followPath'), exact: true })).toBeVisible();
        await page.getByRole('button', { name: await t('followPath'), exact: true }).click();
        await page.evaluate(() => window.__inkbridgeIntegrated.flush());
        await expect.poll(async () => (await page.evaluate(() => window.inkbridge.load())).connections[0]?.labelFollowPath).toBe(true);
        await page.getByRole('button', { name: await t('startArrow'), exact: true }).click();
        await page.getByRole('dialog').last().getByRole('button').nth(1).click();
        await page.keyboard.press('Escape');
        await expect.poll(async () => (await page.evaluate(() => window.inkbridge.load())).connections[0]?.beginStyle).toBe('arrow');
        await page.getByRole('button', { name: await t('edgeLineColor'), exact: true }).click();
        const colors = page.getByRole('dialog').last().locator('[class~=grid-cols-12] > div[style*="background-color"]');
        await expect(colors.first()).toBeVisible();
        await colors.nth(3).click();
        await page.keyboard.press('Escape');
        await expect.poll(async () => (await page.evaluate(() => window.inkbridge.load())).connections[0]?.color).not.toBe(edge.color);
        await page.getByRole('button',{name:await t('pathType'),exact:true}).click();
        await page.getByRole('dialog').last().getByRole('button').nth(0).click();
        await page.keyboard.press('Escape');
        await expect.poll(async()=>(await page.evaluate(()=>window.inkbridge.load())).connections[0]?.pathType).toBe('straight');
        const savedConnections = (await page.evaluate(() => window.inkbridge.load())).connections;
        await page.screenshot({ path: path.resolve(__dirname, '../../private-original-editor/native-connections.png') });
        assert.deepEqual(await page.evaluate(() => window.__inkbridgeIntegrated.errors), []);
        await app.close();
        app = await launch();
        page = await app.firstWindow();
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        assert.deepEqual((await page.evaluate(() => window.inkbridge.load())).connections, savedConnections);
        await page.mouse.click((points[0].x + points[1].x) / 2, points[0].y);
        await page.getByRole('button', { name: await t('deleteEdge'), exact: true }).click();
        await expect.poll(async () => ((await page.evaluate(() => window.inkbridge.load())).connections || []).length).toBe(0);
        await page.locator('#original-native-tools').getByRole('button', { name: label, exact: true }).click();
        await page.mouse.move(points[0].x - 2, points[0].y);
        await page.mouse.down();
        await page.mouse.move(points[1].x + 2, points[1].y, { steps: 12 });
        await page.mouse.up();
        await expect.poll(async () => ((await page.evaluate(() => window.inkbridge.load())).connections || []).length).toBe(1);
        assert.equal((await page.evaluate(()=>window.inkbridge.load())).connections[0].pathType,'bezier','restart and editing an old link must not change the default for the next new link');
        await page.locator('#original-native-tools').getByRole('button', { name: await t('viewControls.create selection'), exact: true }).click();
        await page.mouse.click(points[0].x - 150, points[0].y - 20);
        await expect(page.locator('.selection-toolbar-container')).toBeVisible();
        await page.locator('.selection-toolbar-container .lucide-circle-x').locator('..').click();
        await page.evaluate(() => window.__inkbridgeIntegrated.flush());
        await expect.poll(async () => ((await page.evaluate(() => window.inkbridge.load())).connections || []).length).toBe(0);
        assert.equal(await page.evaluate(() => window.__originalRequire(23).gt.getState().connections.length), 0);
        console.log(JSON.stringify({ nativeConnectMode: true, realEndpointDrag: true, sqliteConnection: true, originalDirectedLinks: true, restartRetained: true, nativeFollowPath: true, nativeDeleteEdge: true, nodeRemovalCascades: true, nativeStartArrow: true, nativeColor: true }));
    }
    catch (error) {
        console.error(error);
        if (page && !page.isClosed()) {
            console.log((await page.locator('body').innerText()).slice(-1200));
            console.log(await page.evaluate(() => window.__inkbridgeIntegrated));
            await page.screenshot({ path: path.resolve(__dirname, '../../private-original-editor/native-connections-failure.png') });
        }
        await app.evaluate(({ app }) => app.exit(1)).catch(() => { });
        throw error;
    }
    finally {
        await app.close().catch(() => { });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
