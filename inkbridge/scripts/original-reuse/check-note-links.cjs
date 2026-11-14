// Real Electron check: links inside note cards (src/main/open-links.cjs, user decision
// 2026-11-14). While editing, a click on a web link goes through the original 'openUrl'
// service and Ctrl+click through the original window.open; both reach the system. A local
// file link asks first. The system calls are replaced by recorders, so nothing really opens.
// Synthetic workspace only.
const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { WorkspaceDatabase } = require('../../src/main/database.cjs');
const text = t => ({ type: 'text', version: 1, text: t, format: 0, detail: 0, mode: 'normal', style: '' });
const paragraph = children => ({ type: 'paragraph', version: 1, direction: null, format: '', indent: 0, children });
const link = (url, label) => ({ type: 'link', version: 1, url, rel: 'noreferrer', target: null, title: null, direction: null, format: '', indent: 0, children: [text(label)] });
const WEB = 'https://example.com/sites/x/_layouts/15/Doc.aspx?sourcedoc=%7B123%7D&file=E.xlsx', LOCAL = 'file:///C:/InkBridgeTest/run.bat';
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-links-')), db = new WorkspaceDatabase(path.join(data, 'Workspace/inkbridge.sqlite3'));
  const doc = { root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children: [paragraph([link(WEB, 'E 次 RMS 申請表.xlsx')]), paragraph([link(LOCAL, '本機批次檔')]), paragraph([text('後面的文字')])] } };
  db.commit({ requestId: crypto.randomUUID(), baseRevision: 0, operations: [{ type: 'putBoard', data: { id: 'board-main', title: 'Links', view: { x: 0, y: 0, zoom: 1 } } }, { type: 'putContent', data: { id: 'note', kind: 'text', title: '', body: '', document: doc, tone: 'sage' } }, { type: 'putInstance', data: { id: 'note-instance', contentId: 'note', boardId: 'board-main', x: 200, y: 150, width: 420, height: 240, z: 0 } }] }); db.close();
  const env = { ...process.env, INKBRIDGE_ORIGINAL_VIEW: 'board', INKBRIDGE_ORIGINAL_PROBE_DATA: data }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env });
  let page;
  try {
    page = await app.firstWindow(); page.setDefaultTimeout(15000); await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready); await page.evaluate(() => window.__inkbridgeIntegrated.switchBoard('board-main'));
    await app.evaluate(({ shell, dialog }) => { globalThis.__calls = []; globalThis.__answer = 1; shell.openExternal = async url => { globalThis.__calls.push(['external', url]); }; shell.openPath = async p => { globalThis.__calls.push(['path', p]); return ''; }; dialog.showMessageBox = async (...args) => { globalThis.__calls.push(['ask', (args.length > 1 ? args[1] : args[0]).detail]); return { response: globalThis.__answer }; }; });
    const calls = async () => { await page.waitForTimeout(600); return app.evaluate(() => globalThis.__calls.splice(0)); };
    const p = await page.evaluate(() => { const s = window.__inkbridgeIntegrated.inspect(), n = s.nodes.find(n => n.id === 'note-instance'), b = document.querySelector('#board').getBoundingClientRect(); return { x: b.x + s.view.translateX + n.position.x * s.view.scale, y: b.y + s.view.translateY + n.position.y * s.view.scale }; });
    await page.mouse.dblclick(p.x + 300, p.y + 160); const editor = page.locator('#board [contenteditable=true]').first(); await expect(editor).toBeVisible();
    const web = editor.locator('a', { hasText: 'E 次 RMS 申請表.xlsx' }), local = editor.locator('a', { hasText: '本機批次檔' });
    // 1. Click (original openUrl service) and Ctrl+click (original window.open) both reach the system browser.
    await web.click(); assert.deepEqual(await calls(), [['external', WEB]], 'click opens the web link');
    await web.click({ modifiers: ['Control'] }); assert.deepEqual(await calls(), [['external', WEB]], 'Ctrl+click opens the web link');
    // 2. A local file link asks first; cancelling opens nothing, confirming opens the path.
    await local.click(); assert.deepEqual(await calls(), [['ask', 'C:\\InkBridgeTest\\run.bat']], 'local file asks first and cancel opens nothing');
    await app.evaluate(() => { globalThis.__answer = 0; }); await local.click(); assert.deepEqual(await calls(), [['ask', 'C:\\InkBridgeTest\\run.bat'], ['path', 'C:\\InkBridgeTest\\run.bat']], 'confirmed local file opens');
    // 3. The app never navigates or opens a window of its own.
    assert.equal(app.windows().length, 1); assert(page.url().startsWith('http://127.0.0.1:'));
    assert.deepEqual(await page.evaluate(() => window.__inkbridgeIntegrated.errors), []);
    console.log(JSON.stringify({ data, clickOpensWeb: true, ctrlClickOpensWeb: true, localAsksFirst: true, noInAppWindow: true }));
  } catch (error) { await page?.screenshot({ path: path.join(data, 'note-links-failure.png') }).catch(() => {}); console.error({ data }); console.error(error); process.exitCode = 1; }
  finally { await app.close().catch(() => {}); if (!process.exitCode) await fs.rm(data, { recursive: true, force: true }).catch(() => {}); }
})();
