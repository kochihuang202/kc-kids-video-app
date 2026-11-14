// Real Electron check for the video highlight panel's large-image mode (REG-159;
// apply-highlight-image-mode-patches.cjs). Synthetic fixture and temporary workspace only:
// one marker with a screenshot → the view button cycles standard (78 px thumbnail) → large
// (screenshot spans the panel and follows its width when the panel is dragged wider) → compact
// (no screenshot) → standard; the large mode is remembered after a restart.
const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-')), media = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-video-fixture-'));
  const file = path.join(media, 'sample.mp4'); require('../../tests/helpers/video-fixture.cjs')(file);
  const env = { ...process.env, INKBRIDGE_ORIGINAL_PROBE_DATA: data, INKBRIDGE_ORIGINAL_VIEW: 'board' }; delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => _electron.launch({ args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env });
  let app = await launch(), page; const errors = [];
  const start = async () => { page = await app.firstWindow(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message)); await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready); };
  const t = key => page.evaluate(key => window.__originalRequire(1643).ag.t(key, { ns: 'common' }), key), load = () => page.evaluate(() => window.inkbridge.load());
  const panel = () => page.locator('#original-flow-outline'), button = () => panel().locator('[data-inkbridge-highlight-view]');
  const shot = () => page.evaluate(() => { const img = [...document.querySelectorAll('#original-flow-outline img')].find(i => /cursor-pointer/.test(i.className) && i.closest('.highlight-related-text')); return img ? Math.round(img.getBoundingClientRect().width) : 0; });
  const panelWidth = () => panel().evaluate(el => Math.round(el.getBoundingClientRect().width));
  const openPanel = async title => { await page.locator('#original-top-views button').filter({ has: page.getByText(await t('highlight'), { exact: true }) }).first().click(); await panel().getByText(title, { exact: true }).first().click(); await expect(panel().getByRole('button', { name: new RegExp(await t('addMarker')) })).toBeVisible(); };
  try {
    await start();
    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('tablist') });
    await page.mouse.click(301, 536); await page.getByText(/^(視頻|视频)$/).first().click(); await page.mouse.click(520, 250); await expect(dialog).toBeVisible();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), dialog.getByText(await t('videoModal.dropTitle'), { exact: true }).click()]); await chooser.setFiles(file);
    await dialog.locator('button').filter({ hasText: /^(創建|创建|Create)$/ }).last().click(); await expect(dialog).toBeHidden();
    await expect.poll(async () => (await load()).contents.some(row => row.kind === 'video')).toBe(true);
    const title = (await load()).contents.find(row => row.kind === 'video').title;
    await page.keyboard.press('Escape'); await page.mouse.click(700, 820);
    await openPanel(title);
    await panel().getByRole('button', { name: new RegExp(await t('addMarker')) }).click();
    await expect.poll(async () => ((await load()).videoHighlights || []).filter(h => h.screenshotFileId).length, { timeout: 15000 }).toBe(1);
    // Standard: the original thumbnail.
    await expect.poll(shot).toBe(78); assert.equal(await button().getAttribute('data-inkbridge-highlight-view'), 'standard');
    // Large: spans the panel and follows its width.
    await button().click(); assert.equal(await button().getAttribute('data-inkbridge-highlight-view'), 'large');
    await expect.poll(shot).toBeGreaterThan(200); const narrow = await shot(), width0 = await panelWidth();
    // Widen the panel through the original width setting its resize handle writes.
    await page.evaluate(w => window.__originalRequire(63268).Z.dispatch({ type: 'ui/setFlowDetailWidth', payload: w }), width0 + 160);
    // The panel animates to its new width; wait until both settle, then compare the growth.
    let narrowGap = (await panelWidth()) - narrow, wide = 0, wider = 0;
    await expect.poll(async () => { wider = await panelWidth(); wide = await shot(); return wider > width0 + 100 && Math.abs((wider - wide) - narrowGap) <= 12; }, { timeout: 8000 }).toBe(true);
    // Compact: no screenshot; then back to standard.
    await button().click(); assert.equal(await button().getAttribute('data-inkbridge-highlight-view'), 'compact'); await expect.poll(shot).toBe(0);
    await button().click(); assert.equal(await button().getAttribute('data-inkbridge-highlight-view'), 'standard'); await expect.poll(shot).toBe(78);
    // Large is remembered after a restart.
    await button().click(); await page.waitForTimeout(300);
    await app.close(); app = await launch(); await start(); await openPanel(title);
    assert.equal(await button().getAttribute('data-inkbridge-highlight-view'), 'large'); await expect.poll(shot).toBeGreaterThan(200);
    assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => window.__inkbridgeIntegrated.errors), []);
    console.log(JSON.stringify({ data, standard: 78, large: { narrow, wide, panel: [width0, wider] }, compact: 0, rememberedAfterRestart: true }));
  } catch (error) { await page?.screenshot({ path: path.join(data, 'highlight-image-mode-failure.png') }).catch(() => {}); console.error({ data }); console.error(error); process.exitCode = 1; }
  finally { await app.close().catch(() => {}); await fs.rm(media, { recursive: true, force: true }); }
})();
