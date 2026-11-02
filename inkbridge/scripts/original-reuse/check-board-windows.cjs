const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { WorkspaceDatabase } = require('../../src/main/database.cjs');
(async () => {
    const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-board-window-')), db = new WorkspaceDatabase(path.join(data, 'Workspace/inkbridge.sqlite3')), { noteDocument } = await import('../../src/core/rich-document.mjs');
    db.commit({ requestId: crypto.randomUUID(), baseRevision: 0, operations: [{ type: 'putBoard', data: { id: 'board-two', title: 'WINDOW_BOARD_TWO', view: { x: 30, y: 40, zoom: .8 } } }, ...['main', 'two'].flatMap((id, i) => [{ type: 'putContent', data: { id: 'note-' + id, title: 'NOTE_' + id, body: 'NOTE_' + id, document: noteDocument({ title: 'NOTE_' + id, body: 'NOTE_' + id }), kind: 'text', tone: 'sage' } }, { type: 'putInstance', data: { id: 'node-' + id, contentId: 'note-' + id, boardId: 'board-' + id, x: 80, y: 150, width: 360, height: 240, z: 0 } }])] });
    db.close();
    const env = { ...process.env, INKBRIDGE_ORIGINAL_PROBE_DATA: data, INKBRIDGE_ORIGINAL_VIEW: 'board' };
    delete env.ELECTRON_RUN_AS_NODE;
    const launch = () => _electron.launch({ args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env });
    let app = await launch(), page, child;
    try {
        page = await app.firstWindow();
        page.setDefaultTimeout(8000);
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        await app.evaluate(({dialog})=>{globalThis.__boardDialogs=[];dialog.showErrorBox=(title,message)=>globalThis.__boardDialogs.push({title,message});});
        await page.locator('#original-board-list').getByText('WINDOW_BOARD_TWO', { exact: true }).click();
        await expect.poll(() => page.evaluate(() => window.__inkbridgeIntegrated.inspect().boardId)).toBe('board-two');
        const tab = page.locator('[data-tour="history-tabs"] [data-active]').filter({ hasText: 'WINDOW_BOARD_TWO' });
        await tab.click({ button: 'right' });
        await page.getByRole('menuitem', { name: '新窗口打開' }).click();
        await expect.poll(() => app.windows().length, { timeout: 5000 }).toBe(2);
        child = app.windows().find(p => p !== page);
        child.setDefaultTimeout(8000);
        await child.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        assert.equal(await child.evaluate(() => window.__inkbridgeIntegrated.inspect().boardId), 'board-two');
        assert.equal((await child.evaluate(() => window.__inkbridgeIntegrated.inspect().nodes))[0].id, 'node-two');
        assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => w.getNativeWindowHandle().length).length), 2);
        await page.bringToFront();
        await tab.click({ button: 'right' });
        await page.getByRole('menuitem', { name: '新窗口打開' }).click();
        assert.equal(app.windows().length, 2);
        const edit = async (p, id, text) => { await p.bringToFront(); const point = await p.evaluate(id => { const s = window.__inkbridgeIntegrated.inspect(), n = s.nodes.find(n => n.id === id), b = document.querySelector('#board').getBoundingClientRect(); return { x: b.x + s.view.translateX + (n.position.x + 30) * s.view.scale, y: b.y + s.view.translateY + (n.position.y + 30) * s.view.scale }; }, id); await p.mouse.dblclick(point.x, point.y); const editor = p.locator('#board [contenteditable=true]').first(); await expect(editor).toBeVisible(); await editor.press('Control+End'); await p.keyboard.insertText(text); return editor; };
        const editor = await edit(child, 'node-two', ' 新白板窗口修改');
        await child.keyboard.press('Control+s');
        await expect.poll(async () => JSON.stringify((await page.evaluate(() => window.inkbridge.load())).contents.find(c => c.id === 'note-two').document)).toContain('新白板窗口修改');
        await expect.poll(() => page.evaluate(() => JSON.stringify(window.__inkbridgeIntegrated.inspect().nodes.find(n => n.id === 'node-two').data.content))).toContain('新白板窗口修改');
        // The full native canvas handles dragging in the child, not a preview image.
        await child.mouse.click(850, 600);
        const before = await child.evaluate(() => window.__inkbridgeIntegrated.inspect());
        const n = before.nodes.find(n => n.id === 'node-two'), box = await child.locator('#board').boundingBox(), x = box.x + before.view.translateX + (n.position.x + 20) * before.view.scale, y = box.y + before.view.translateY + (n.position.y + 15) * before.view.scale;
        await child.mouse.move(x, y);
        await child.mouse.down();
        await child.mouse.move(x + 45, y + 35, { steps: 8 });
        await child.mouse.up();
        await child.keyboard.press('Control+s');
        const moved = (await page.evaluate(() => window.inkbridge.load())).instances.find(n => n.id === 'node-two');
        assert(moved.x !== 80 || moved.y !== 150, 'real child canvas drag must reach SQLite');
        // Navigate the parent elsewhere while retaining the independently opened board.
        await page.bringToFront();
        await page.locator('#original-board-list').getByText('靈感白板', { exact: true }).click();
        await expect.poll(() => page.evaluate(() => window.__inkbridgeIntegrated.inspect().boardId)).toBe('board-main');
        await edit(page, 'node-main', ' 主窗口另一白板修改');
        await page.keyboard.press('Control+s');
        await expect.poll(() => child.evaluate(() => window.__inkbridgeIntegrated.inspect().boardId)).toBe('board-two');
        await child.bringToFront();
        await child.mouse.dblclick(650, 500);
        await expect.poll(() => child.evaluate(() => window.__inkbridgeIntegrated.inspect().nodes.length)).toBe(2);
        await child.keyboard.press('Control+s');
        await child.evaluate(()=>window.__inkbridgeIntegrated.flush());
        const saved = await page.evaluate(() => window.inkbridge.load());
        assert(saved.contents.find(c => c.id === 'note-main').body.includes('主窗口另一白板修改'));
        assert.equal(saved.instances.filter(n => n.boardId === 'board-two').length, 2);
        // Failed writes retain a real editor draft; conflicting same-note changes do
        // not inherit an unseen revision and overwrite the other window's document.
        await page.evaluate(() => { const original = window.__inkbridgeRemoteRequest; window.__testRemote = original; window.__rejectBoard = true; window.__inkbridgeRemoteRequest = request => request.method === 'workspaceCommit' && window.__rejectBoard ? Promise.reject(Error('TEST_BOARD_IO_FAILURE')) : original(request); });
        await edit(child, 'node-two', ' CHILD_CONFLICT_DRAFT');
        await child.keyboard.press('Control+s');
        await expect(child.locator('#persistence-status')).toContainText('TEST_BOARD_IO_FAILURE');
        await page.bringToFront();
        await page.locator('#original-board-list').getByText('WINDOW_BOARD_TWO', { exact: true }).click();
        await edit(page, 'node-two', ' MAIN_LATEST_VERSION');
        await page.keyboard.press('Control+s');
        await page.evaluate(() => window.__rejectBoard = false);
        await child.bringToFront();
        await child.keyboard.press('Control+s');
        await expect(child.locator('#persistence-status')).toContainText('另一個視窗已修改');
        const protectedGraph = await page.evaluate(() => window.inkbridge.load());
        assert(!protectedGraph.contents.find(c => c.id === 'note-two').body.includes('CHILD_CONFLICT_DRAFT'));
        assert(protectedGraph.contents.find(c => c.id === 'note-two').body.includes('MAIN_LATEST_VERSION'));
        await child.locator('#board-window-recover').click();
        await expect.poll(async () => { try {
            return await child.evaluate(() => window.__inkbridgeIntegrated?.ready && document.querySelector('#board-navigation-status').textContent.includes('舊草稿保留於'));
        }
        catch {
            return false;
        } }).toBe(true);
        const recovery = JSON.parse(await fs.readFile(path.join(data, 'Recovery', (await fs.readdir(path.join(data, 'Recovery')))[0]), 'utf8'));
        assert(JSON.stringify(recovery.operations).includes('CHILD_CONFLICT_DRAFT'));
        await expect.poll(() => child.evaluate(() => JSON.stringify(window.__inkbridgeIntegrated.inspect().nodes.find(n => n.id === 'node-two').data.content))).toContain('MAIN_LATEST_VERSION');
        await page.evaluate(() => {const original=window.__testRemote;window.__inkbridgeRemoteRequest=request=>original(request).catch(error=>{window.__failedBoardRequest=request;throw error;});});
        await child.screenshot({ path: path.resolve(__dirname, '../../private-original-editor/board-window.png') });
        await edit(child, 'node-two', ' 立即關閉白板窗口');
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/board-window')).close());
        await expect.poll(() => child.isClosed()).toBe(true);
        assert((await page.evaluate(() => window.inkbridge.load())).contents.find(c => c.id === 'note-two').body.includes('立即關閉白板窗口'));
        assert.deepEqual(await page.evaluate(() => window.__inkbridgeIntegrated.errors), []);
        await tab.click({button:'right'});await page.getByRole('menuitem',{name:'新窗口打開'}).click();
        await expect.poll(()=>app.windows().length).toBe(2);child=app.windows().find(p=>p!==page);await child.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);
        await edit(child,'node-two',' PARENT_CLOSE_FLUSHES_BOARD');
        const closed=app.waitForEvent('close');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>new URL(w.webContents.getURL()).pathname==='/').close());await closed;
        app = await launch();
        page = await app.firstWindow();
        page.setDefaultTimeout(8000);
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        const restored = await page.evaluate(() => window.inkbridge.load());
        assert(restored.contents.find(c => c.id === 'note-two').body.includes('立即關閉白板窗口'));
        assert(restored.contents.find(c => c.id === 'note-two').body.includes('PARENT_CLOSE_FLUSHES_BOARD'));
        assert.equal(restored.instances.filter(n => n.boardId === 'board-two').length, 2);
        console.log(JSON.stringify({ tabOpensRealBoardWindow: true, targetBoard: true, reused: true, nativeEdit: true, realDrag: true, parentOtherBoardIndependent: true, childCreateCard: true, failedWriteRetainsDraft: true, conflictDoesNotOverwrite: true, recoveryJsonBeforeReload: true, immediateCloseSaved: true,parentCloseWaitsForBoard:true, restart: true, data }));
    }
    catch (error) {
        console.error('BOARD_WINDOW_REPRO', error.message);
        console.error('dialogs',await app.evaluate(()=>globalThis.__boardDialogs).catch(()=>[]));for(const view of [page,child])if(view&&!view.isClosed())console.error(await view.evaluate(()=>({url:location.pathname,inert:document.body.inert,trace:window.__boardBridgeTrace,failed:window.__failedBoardRequest,status:window.__inkbridgeIntegrated.persistence})).catch(()=>({unresponsive:true})));
        if (child && !child.isClosed()) {
            console.error(await child.evaluate(() => ({ state: window.__inkbridgeIntegrated?.inspect(), status: document.querySelector('#persistence-status')?.textContent })));
            await child.screenshot({ path: path.resolve(__dirname, '../../private-original-editor/board-window-failure.png') }).catch(() => { });
        }
        console.error(await page.evaluate(() => ({ errors: window.__inkbridgeIntegrated.errors, hasService: window.__inkbridgeServices.has('openStandaloneWindow') })));
        await app.evaluate(({ app }) => app.exit(1)).catch(() => { });
        throw error;
    }
    finally {
        await app.close().catch(() => { });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
