// Real Electron check: links inside note cards (src/main/open-links.cjs, user decisions
// 2026-11-14; REG-155/156). While editing, a click on a web link goes through the original
// 'openUrl' service and Ctrl+click through the original window.open; both reach the system.
// A local file link asks first. A pasted Windows folder path becomes a link (desktop-only
// auto-link, apply-link-path-patches.cjs) and opens without asking; the link editor accepts a
// path; a path missing on this computer only says so. The system calls are replaced by
// recorders, so nothing really opens. Synthetic workspace and a temporary folder only.
const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { WorkspaceDatabase } = require('../../src/main/database.cjs');
const text = t => ({ type: 'text', version: 1, text: t, format: 0, detail: 0, mode: 'normal', style: '' });
const paragraph = children => ({ type: 'paragraph', version: 1, direction: null, format: '', indent: 0, children });
const link = (url, label) => ({ type: 'link', version: 1, url, rel: 'noreferrer', target: null, title: null, direction: null, format: '', indent: 0, children: [text(label)] });
const WEB = 'https://example.com/sites/x/_layouts/15/Doc.aspx?sourcedoc=%7B123%7D&file=E.xlsx';
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-links-')), db = new WorkspaceDatabase(path.join(data, 'Workspace/inkbridge.sqlite3'));
  const folder = path.join(data, 'LinkFolder'), batch = path.join(folder, 'run.bat'), missing = path.join(data, 'NotHere');
  await fs.mkdir(folder); await fs.writeFile(batch, '@echo synthetic\r\n');
  const doc = { root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children: [paragraph([link(WEB, 'E 次 RMS 申請表.xlsx')]), paragraph([link(pathToFileURL(batch).href, '本機批次檔')]), paragraph([text('說明文件')]), paragraph([text('後面的文字')])] } };
  db.commit({ requestId: crypto.randomUUID(), baseRevision: 0, operations: [{ type: 'putBoard', data: { id: 'board-main', title: 'Links', view: { x: 0, y: 0, zoom: 1 } } }, { type: 'putContent', data: { id: 'note', kind: 'text', title: '', body: '', document: doc, tone: 'sage' } }, { type: 'putInstance', data: { id: 'note-instance', contentId: 'note', boardId: 'board-main', x: 200, y: 150, width: 520, height: 300, z: 0 } }] }); db.close();
  const env = { ...process.env, INKBRIDGE_ORIGINAL_VIEW: 'board', INKBRIDGE_ORIGINAL_PROBE_DATA: data }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env });
  let page, savedClipboard = null;
  try {
    savedClipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
    page = await app.firstWindow(); page.setDefaultTimeout(15000); await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready); await page.evaluate(() => window.__inkbridgeIntegrated.switchBoard('board-main'));
    await app.evaluate(({ shell, dialog }) => { globalThis.__calls = []; globalThis.__answer = 1; shell.openExternal = async url => { globalThis.__calls.push(['external', url]); }; shell.openPath = async p => { globalThis.__calls.push(['path', p]); return ''; }; dialog.showMessageBox = async (...args) => { const o = args.length > 1 ? args[1] : args[0]; globalThis.__calls.push([o.type === 'info' ? 'notice' : 'ask', o.detail]); return { response: globalThis.__answer }; }; });
    const calls = async () => { await page.waitForTimeout(600); return app.evaluate(() => globalThis.__calls.splice(0)); };
    const urls = () => editor.evaluate(e => (JSON.stringify(e.__lexicalEditor.getEditorState().toJSON()).match(/"url":"[^"]*"/g) || []).map(s => JSON.parse('{' + s + '}').url));
    const p = await page.evaluate(() => { const s = window.__inkbridgeIntegrated.inspect(), n = s.nodes.find(n => n.id === 'note-instance'), b = document.querySelector('#board').getBoundingClientRect(); return { x: b.x + s.view.translateX + n.position.x * s.view.scale, y: b.y + s.view.translateY + n.position.y * s.view.scale }; });
    await page.mouse.dblclick(p.x + 400, p.y + 170); const editor = page.locator('#board [contenteditable=true]').first(); await expect(editor).toBeVisible();
    const web = editor.locator('a', { hasText: 'E 次 RMS 申請表.xlsx' }), local = editor.locator('a', { hasText: '本機批次檔' });
    // 1. Click (original openUrl service) and Ctrl+click (original window.open) both reach the system browser.
    await web.click(); assert.deepEqual(await calls(), [['external', WEB]], 'click opens the web link');
    await web.click({ modifiers: ['Control'] }); assert.deepEqual(await calls(), [['external', WEB]], 'Ctrl+click opens the web link');
    // 2. A local file link asks first; cancelling opens nothing, confirming opens the path.
    await local.click(); assert.deepEqual(await calls(), [['ask', batch]], 'local file asks first and cancel opens nothing');
    await app.evaluate(() => { globalThis.__answer = 0; }); await local.click(); assert.deepEqual(await calls(), [['ask', batch], ['path', batch]], 'confirmed local file opens');
    await app.evaluate(() => { globalThis.__answer = 1; });
    // 3. A pasted folder path becomes a link and opens the folder without asking.
    await editor.press('Control+End'); await page.keyboard.press('Enter');
    await app.evaluate(({ clipboard }, t) => clipboard.writeText(t), folder); await page.keyboard.press('Control+v'); await page.keyboard.type(' ');
    await expect.poll(urls).toContain(folder);
    await editor.locator('a', { hasText: path.basename(folder) }).click(); assert.deepEqual(await calls(), [['path', folder]], 'folder opens directly');
    // 4. The original link editor (pencil beside a link) accepts a path as the address.
    await web.hover(); await page.locator('.link-hover-edit-btn').filter({ visible: true }).first().click();
    const input = page.locator('.link-editor input').filter({ visible: true }).first(); await expect(input).toHaveValue(WEB); await input.fill(folder); await input.press('Enter');
    await expect.poll(async () => (await urls()).filter(u => u === folder).length).toBe(2);
    // 5. A path that does not exist on this computer only says so.
    await editor.press('Control+End'); await page.keyboard.press('Enter'); await app.evaluate(({ clipboard }, t) => clipboard.writeText(t), missing); await page.keyboard.press('Control+v'); await page.keyboard.type(' ');
    await expect.poll(urls).toContain(missing);
    await editor.locator('a', { hasText: 'NotHere' }).click(); assert.deepEqual(await calls(), [['notice', missing]], 'missing path is reported, nothing opens');
    // 6. The app never navigates or opens a window of its own.
    assert.equal(app.windows().length, 1); assert(page.url().startsWith('http://127.0.0.1:'));
    assert.deepEqual(await page.evaluate(() => window.__inkbridgeIntegrated.errors), []);
    await page.keyboard.press('Escape'); await page.evaluate(() => window.__inkbridgeIntegrated.flush?.());
    console.log(JSON.stringify({ data, clickOpensWeb: true, ctrlClickOpensWeb: true, localAsksFirst: true, pastedFolderBecomesLink: true, folderOpensDirectly: true, linkEditorAcceptsPath: true, missingPathReported: true, noInAppWindow: true }));
  } catch (error) { await page?.screenshot({ path: path.join(data, 'note-links-failure.png') }).catch(() => {}); console.error({ data }); console.error(error); process.exitCode = 1; }
  finally { if (savedClipboard !== null) await app.evaluate(({ clipboard }, t) => clipboard.writeText(t), savedClipboard).catch(() => {}); await app.close().catch(() => {}); if (!process.exitCode) await fs.rm(data, { recursive: true, force: true }).catch(() => {}); }
})();
