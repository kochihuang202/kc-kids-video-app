// Real Electron check: image and video file names have separate switches and each board keeps
// its own choice (media-file-names.mjs, apply-media-file-name-patches.cjs, prepare-sharing.cjs;
// user decision 2026-11-14, REG-157). Boards without a choice follow the global switch.
// Synthetic workspace only.
const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { WorkspaceDatabase } = require('../../src/main/database.cjs');
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-media-names-')), graph = await require('../../tests/helpers/web-share-fixture.cjs')(data), db = new WorkspaceDatabase(path.join(data, 'Workspace/inkbridge.sqlite3'));
  const operations = [...graph.boards.map(data => ({ type: 'putBoard', data })), ...graph.contents.map(data => ({ type: 'putContent', data: { tone: 'sage', body: '', ...data } })), ...graph.instances.map(data => ({ type: 'putInstance', data })), ...graph.cardMetadata.map(data => ({ type: 'putCatalog', kind: 'card', data })), ...graph.files.map(data => ({ type: 'putCatalog', kind: 'file', data })), ...graph.whiteboardInstances.map(data => ({ type: 'putCatalog', kind: 'whiteboard-instance', data }))];
  db.commit({ requestId: crypto.randomUUID(), baseRevision: 0, operations }); db.close();
  const env = { ...process.env, INKBRIDGE_ORIGINAL_VIEW: 'board', INKBRIDGE_ORIGINAL_PROBE_DATA: data }; delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => _electron.launch({ args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env });
  let app = await launch(), page;
  const start = async board => { page = await app.firstWindow(); page.setDefaultTimeout(15000); await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready); await page.evaluate(id => window.__inkbridgeIntegrated.switchBoard(id), board); await page.waitForTimeout(500); };
  const t = key => page.evaluate(key => window.__originalRequire(1643).ag.t(key, { ns: 'common' }), key);
  const saved = async id => (await page.evaluate(() => window.inkbridge.load())).boards.find(b => b.id === id)?.attributes?.inkbridgeMediaFileNames || null;
  const shown = kind => page.evaluate(kind => globalThis.__inkbridgeMediaFileName(kind, { showMediaFileNameOnCanvas: window.__originalRequire(63268).Z.getState().ui.showMediaFileNameOnCanvas }), kind);
  const row = title => page.locator('[data-slot=content] div[class*=justify-between]').filter({ hasText: title });
  const openSettings = async () => { await page.keyboard.press('Escape'); await page.mouse.click(1100, 860); await page.locator('button[aria-label="' + await t('settings') + '"]').click(); await expect(row('顯示圖片檔名')).toBeVisible(); };
  const closeSettings = async () => { await page.keyboard.press('Escape'); if (await row('顯示圖片檔名').count()) await page.mouse.click(600, 760); await expect(row('顯示圖片檔名')).toHaveCount(0); };
  const isOn = title => row(title).locator('input').first().isChecked();
  try {
    await start('root');
    // 1. Two file-name switches and the newly completed focus switch are enabled.
    await openSettings();
    await expect(page.locator('[data-slot=content]').getByText(await t('showMediaFileNameOnCanvas'), { exact: true })).toHaveCount(0);
    await expect(row('顯示影片檔名')).toBeVisible();
    await expect.poll(() => page.evaluate(() => { const pop = [...document.querySelectorAll('[data-slot=content]')].find(p => p.textContent.includes('顯示圖片檔名')); return [...pop.querySelectorAll('input')].filter(c => !c.disabled).length; })).toBe(3);
    assert.deepEqual([await isOn('顯示圖片檔名'), await isOn('顯示影片檔名')], [false, false], 'a board without a choice follows the global default (off)');
    // 2. Image names on for the root board only.
    await row('顯示圖片檔名').locator('label').first().click();
    await expect.poll(() => saved('root')).toEqual({ image: true, video: false });
    assert.deepEqual([await shown('image'), await shown('video')], [true, false]);
    await closeSettings(); await page.waitForTimeout(400); await page.screenshot({ path: path.join(data, 'root-image-names.png') });
    // 3. Another board is unaffected; its own video switch does not change the root board.
    await page.evaluate(() => window.__inkbridgeIntegrated.switchBoard('child')); await page.waitForTimeout(500);
    assert.deepEqual([await shown('image'), await shown('video')], [false, false], 'other board keeps the default');
    await openSettings(); assert.deepEqual([await isOn('顯示圖片檔名'), await isOn('顯示影片檔名')], [false, false]);
    await row('顯示影片檔名').locator('label').first().click();
    await expect.poll(() => saved('child')).toEqual({ image: false, video: true });
    assert.deepEqual(await saved('root'), { image: true, video: false }, 'root board unchanged');
    await closeSettings();
    // 4. Restart: each board keeps its own choice.
    await app.close(); app = await launch(); await start('root');
    assert.deepEqual([await shown('image'), await shown('video')], [true, false]);
    await openSettings(); assert.deepEqual([await isOn('顯示圖片檔名'), await isOn('顯示影片檔名')], [true, false]); await closeSettings();
    await page.evaluate(() => window.__inkbridgeIntegrated.switchBoard('child')); await page.waitForTimeout(500);
    assert.deepEqual([await shown('image'), await shown('video')], [false, true]);
    assert.deepEqual(await page.evaluate(() => window.__inkbridgeIntegrated.errors), []);
    console.log(JSON.stringify({ data, twoSwitches: true, defaultConnectedSwitchesEnabled: true, perBoard: true, defaultFollowsGlobal: true, restart: true }));
  } catch (error) { await page?.screenshot({ path: path.join(data, 'media-names-failure.png') }).catch(() => {}); console.error({ data }); console.error(error); process.exitCode = 1; }
  finally { await app.close().catch(() => {}); }
})();
