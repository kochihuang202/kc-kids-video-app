const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { WorkspaceDatabase } = require('../../src/main/database.cjs');
(async () => {
    const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-empty-card-')), db = new WorkspaceDatabase(path.join(data, 'Workspace/inkbridge.sqlite3'));
    db.commit({ requestId: crypto.randomUUID(), baseRevision: 0, operations: [{ type: 'putBoard', data: { id: 'board-main', title: '空白卡片驗收', view: { x: 0, y: 0, zoom: 1 } } }] });
    db.close();
    const env = { ...process.env, INKBRIDGE_ORIGINAL_VIEW: 'board', INKBRIDGE_ORIGINAL_PROBE_DATA: data };
    delete env.ELECTRON_RUN_AS_NODE;
    const launch = () => _electron.launch({ args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env });
    let app = await launch(), page;
    try {
        page = await app.firstWindow();
        page.setDefaultTimeout(7000);
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        const box = await page.locator('#board').boundingBox();
        await page.mouse.dblclick(box.x + 200, box.y + 180);
        await expect.poll(() => page.evaluate(() => window.__inkbridgeIntegrated.inspect().nodes.length)).toBe(1);
        const node = await page.evaluate(() => window.__inkbridgeIntegrated.inspect().nodes[0]);
        const text = await page.evaluate(doc => window.__originalRequire(45828).Vj(doc), node.data.content);
        assert.equal(text, '', 'new card must not contain a prefilled 新卡片 heading');
        const nativeEmpty = await page.evaluate(() => window.__originalRequire(19281).YH.newEmptyEditorContent());
        assert.deepEqual(node.data.content, nativeEmpty, 'use the original empty-document factory');
        const editor = page.locator('#board [contenteditable=true]').first();
        await expect(editor).toBeVisible();
        await expect(editor).toBeFocused();
        await page.keyboard.insertText('直接開始寫筆記');
        await page.keyboard.press('Control+s');
        await page.evaluate(() => window.__inkbridgeIntegrated.flush());
        const saved = await page.evaluate(() => window.inkbridge.load());
        assert.equal(saved.contents[0].body, '直接開始寫筆記');
        assert.equal(saved.contents[0].title, '直接開始寫筆記');
        assert.deepEqual(await page.evaluate(() => window.__inkbridgeIntegrated.errors), []);
        await app.close();
        app = await launch();
        page = await app.firstWindow();
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        assert.equal((await page.evaluate(() => window.inkbridge.load())).contents[0].body, '直接開始寫筆記');
        console.log(JSON.stringify({ emptyNativeDocument: true, immediateEditorFocus: true, noBackspaceNeeded: true, latestTextSaved: true, restart: true, data }));
    }
    catch (error) {
        console.error(error.message);
        console.error(await page.evaluate(() => ({ editables: [...document.querySelectorAll('[contenteditable]')].map(e => ({ tag: e.tagName, value: e.getAttribute('contenteditable'), visible: e.getBoundingClientRect().width })), state: window.__inkbridgeIntegrated.inspect() })));
        await app.evaluate(({ app }) => app.exit(1)).catch(() => { });
        throw error;
    }
    finally {
        await app.close().catch(() => { });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
