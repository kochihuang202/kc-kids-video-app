const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { WorkspaceDatabase } = require('../../src/main/database.cjs');
(async () => {
    const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-')), db = new WorkspaceDatabase(path.join(data, 'Workspace/inkbridge.sqlite3')), { noteDocument } = await import('../../src/core/rich-document.mjs');
    db.commit({ requestId: crypto.randomUUID(), baseRevision: 0, operations: ['SOURCE_NOTE', 'TARGET_NOTE'].flatMap((id, i) => [{ type: 'putContent', data: { id, title: id, body: id, document: noteDocument({ title: id, body: id }), kind: 'text', tone: 'sage' } }, { type: 'putInstance', data: { id: 'instance-' + id, contentId: id, boardId: 'board-main', x: 80 + i * 500, y: 150, width: 320, height: 200, z: i } }]) });
    db.close();
    const env = { ...process.env, INKBRIDGE_ORIGINAL_PROBE_DATA: data, INKBRIDGE_ORIGINAL_VIEW: 'board' };
    delete env.ELECTRON_RUN_AS_NODE;
    const launch=()=>_electron.launch({ args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env });let app=await launch(),page;
    try {
        page = await app.firstWindow();
        page.setDefaultTimeout(8000);
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        await app.evaluate(({ app }) => app.focus({ steal: true }));
        await page.bringToFront();
        const point = await page.evaluate(() => { const b = document.querySelector('#board').getBoundingClientRect(), s = window.__originalRequire(23).gt.getState(), n = s.nodes.find(row => row.data.objectId === 'SOURCE_NOTE'); return { x: b.x + s.view.translateX + (n.position.x + 140) * s.view.scale, y: b.y + s.view.translateY + (n.position.y + 60) * s.view.scale }; });
        await page.mouse.dblclick(point.x, point.y);
        const editor = page.locator('#board [contenteditable=true]').first();
        await expect(editor).toBeVisible();
        await editor.press('Control+End');
        await page.keyboard.insertText(' [[TARGET_NOTE');
        await expect(page.locator('[role=dialog]').last()).toBeVisible();
        await expect(page.locator('[role=dialog]').last().getByText('TARGET_NOTE', { exact: true }).last()).toBeVisible();
        await page.screenshot({ path: path.resolve(__dirname, '../../private-original-editor/mention-picker.png') });
        await page.locator('[role=dialog]').last().getByText('TARGET_NOTE', { exact: true }).last().click();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Control+s');
        await expect.poll(async () => { const graph = await page.evaluate(() => window.inkbridge.load()); return JSON.stringify(graph.contents.find(row => row.id === 'SOURCE_NOTE').document).includes('"objectId":"TARGET_NOTE"'); }).toBe(true);
        const refs = await page.evaluate(() => window.__inkbridgeServices.call('getCardLinks', { cardId: 'TARGET_NOTE', cardType: 'NoteCard' }));
        assert.equal(refs.linksInNoteCards[0].noteCard.id, 'SOURCE_NOTE');
        assert.equal(refs.linksInNoteCards[0].links[0].type, 'mention');
        const mention = editor.locator('[data-inline-mention-object-id="TARGET_NOTE"]').first();
        await mention.hover();
        await expect(page.locator('[data-position=globalCardPopover]')).toBeVisible();
        assert.deepEqual(await page.evaluate(() => window.__inkbridgeIntegrated.errors), []);
        await page.screenshot({ path: path.resolve(__dirname, '../../private-original-editor/native-mentions.png') });
        await page.evaluate(()=>window.__inkbridgeIntegrated.flush());const saved=(await page.evaluate(()=>window.inkbridge.load())).contents;await app.close();app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);assert.deepEqual((await page.evaluate(()=>window.inkbridge.load())).contents,saved);assert.equal((await page.evaluate(()=>window.__inkbridgeServices.call('getCardLinks',{cardId:'TARGET_NOTE',cardType:'NoteCard'}))).linksInNoteCards[0].noteCard.id,'SOURCE_NOTE');
        console.log(JSON.stringify({restartRetained:true, nativeTypeahead: true, realLexicalMention: true, sqliteCommit: true, originalBacklinks: true, nativeHoverPreview: true }));
    }
    catch (e) {
        console.error(e);
        if (page && !page.isClosed()) {
            console.log((await page.locator('body').innerText()).slice(-2200));
            console.log(await page.evaluate(() => ({ errors: window.__inkbridgeIntegrated.errors, doc: window.__originalRequire(23).gt.getState().nodes[0].data.content })));
            await page.screenshot({ path: path.resolve(__dirname, '../../private-original-editor/native-mentions-failure.png') });
        }
        await app.evaluate(({ app }) => app.exit(1)).catch(() => { });
        throw e;
    }
    finally {
        await app.close().catch(() => { });
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
