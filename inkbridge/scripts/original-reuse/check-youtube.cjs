// Real Electron check for YouTube video cards (video record phase three; src/main/youtube.cjs,
// apply-youtube-patches.cjs, apply-video-record-patches.cjs). Needs internet access to YouTube.
// Uses YouTube's public API sample video (embeddable) and a synthetic workspace only:
// link tab → title and cover (oEmbed, cover saved as a workspace file) → card plays through the
// local player page → panel marker at the exact time with a frame screenshot → 📍 opens the
// panel player at that time → restart keeps the card.
const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const VIDEO = 'M7lc1UVf-VE', LINK = 'https://www.youtube.com/watch?v=' + VIDEO;
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-youtube-'));
  const env = { ...process.env, INKBRIDGE_ORIGINAL_PROBE_DATA: data, INKBRIDGE_ORIGINAL_VIEW: 'board' }; delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => _electron.launch({ args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env });
  let app = await launch(), page;
  const start = async () => { page = await app.firstWindow(); page.setDefaultTimeout(20000); await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready); await page.evaluate(() => { window.__yt = []; window.addEventListener('message', e => { if (e.data && e.data.__ytShim && e.data.type) window.__yt.push(e.data.type + ':' + (e.data.state ?? e.data.code ?? '')); }); }); };
  const t = key => page.evaluate(key => window.__originalRequire(1643).ag.t(key, { ns: 'common' }), key), load = () => page.evaluate(() => window.inkbridge.load());
  const ui = () => page.evaluate(() => window.__originalRequire(63268).Z.getState().ui);
  const panel = () => page.locator('#original-flow-outline'), row = id => panel().locator('[data-video-marker-id="' + id + '"]');
  const panelFrame = () => page.evaluate(() => { const f = document.querySelector('#original-flow-outline iframe'); return f ? f.src : null; });
  const panelTime = () => page.evaluate(async () => { const f = document.querySelector('#original-flow-outline iframe'); return f ? window.__originalRequire(28931).Ym(f, 'getCurrentTime') : null; });
  try {
    await start();
    // 1. Link tab: title and cover from oEmbed; the cover is a workspace file.
    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('tablist') });
    await page.mouse.click(301, 536); await page.getByText(/^(視頻|视频)$/).first().click(); await page.mouse.click(520, 250); await expect(dialog).toBeVisible();
    await dialog.getByRole('tab').nth(1).click();
    const input = dialog.locator('input,textarea').filter({ visible: true }).first(); await input.fill(LINK); await input.press('Enter');
    await dialog.locator('button').filter({ hasText: /^(創建|创建|Create)$/ }).last().click(); await expect(dialog).toBeHidden({ timeout: 30000 });
    let graph; await expect.poll(async () => { graph = await load(); return graph.contents.some(row => row.kind === 'video'); }).toBe(true);
    const content = graph.contents.find(row => row.kind === 'video'), meta = graph.cardMetadata.find(row => row.id === content.id);
    assert.equal(meta.link, LINK); assert.match(content.title, /YouTube Developers Live/);
    assert(meta.cover && (graph.files || []).some(f => f.id === meta.cover), 'cover saved as a workspace file');
    // 2. The card plays through the local player page (127.0.0.1), not YouTube directly.
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('iframe')].map(f => new URL(f.src).hostname))).toContain('127.0.0.1');
    await expect.poll(() => page.evaluate(() => window.__yt.includes('ready:'))).toBe(true);
    // 3. Right panel: a marker on the playing YouTube video stores the exact time and a frame.
    await page.keyboard.press('Escape'); await page.mouse.click(700, 850);
    await page.locator('#original-top-views button').filter({ has: page.getByText(await t('highlight'), { exact: true }) }).first().click();
    await panel().getByText(content.title, { exact: true }).first().click();
    const add = panel().getByRole('button', { name: new RegExp(await t('addMarker')) }); await expect(add).toBeVisible();
    await expect(panel().locator('img[alt="video cover"]')).toBeVisible(); await page.waitForTimeout(500);
    await add.click(); await expect.poll(panelFrame).not.toBeNull();
    await expect.poll(async () => ((await load()).videoHighlights || []).length, { timeout: 20000 }).toBe(1);
    await page.evaluate(() => window.__originalRequire(28931).Ym(document.querySelector('#original-flow-outline iframe'), 'play'));
    await expect.poll(async () => (await panelTime()) || 0, { timeout: 20000 }).toBeGreaterThan(4);
    await add.click(); await expect.poll(async () => ((await load()).videoHighlights || []).length, { timeout: 20000 }).toBe(2);
    graph = await load(); const marked = graph.videoHighlights.reduce((a, b) => b.timeStamp > a.timeStamp ? b : a);
    assert(marked.timeStamp > 4, 'marker at the playing time, got ' + marked.timeStamp);
    assert(marked.screenshotFileId && (graph.files || []).some(f => f.id === marked.screenshotFileId), 'marker has a frame screenshot');
    // 4. Drag it to the board, then 📍 opens the panel player at that time.
    const handle = row(marked.id).locator('button[class*="cursor-grab"]'); await expect(handle).toBeVisible();
    const box = await handle.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(380, 760, { steps: 12 }); await page.mouse.move(330, 780, { steps: 6 }); await page.mouse.up(); // clear of the YouTube player, which sits above the canvas
    await expect.poll(async () => ((await load()).videoHighlightInstances || []).length).toBe(1);
    await page.evaluate(() => { const u = window.__originalRequire(22676); window.__originalRequire(63268).Z.dispatch(u.yn({ view: u.XM.whiteboard })); });
    await page.waitForTimeout(500);
    const pin = await page.evaluate(() => { const s = window.__originalRequire(23).gt.getState(), n = s.nodes.find(n => n.type === 'VideoHighlight'), rect = (s.containerElement || s.canvasElement).getBoundingClientRect(), w = n.measured?.width || n.width || 400; return { x: rect.x + (n.position.x + w - 14 - 70 + 11) * s.view.scale + s.view.translateX, y: rect.y + (n.position.y + 17) * s.view.scale + s.view.translateY }; });
    await page.mouse.click(pin.x, pin.y);
    await expect.poll(async () => (await ui()).flowSidebarView).toBe('media');
    await expect.poll(async () => { const now = await panelTime(); return typeof now === 'number' && Math.abs(now - marked.timeStamp) < 1.5; }, { timeout: 25000 }).toBe(true);
    await page.screenshot({ path: path.join(data, 'youtube-pin.png') });
    // 5. Restart: the card, its cover and its highlights are kept.
    await app.close(); app = await launch(); await start();
    graph = await load(); assert.equal(graph.cardMetadata.find(row => row.id === content.id).link, LINK); assert.equal(graph.videoHighlights.filter(h => !h.isTrashed).length, 2);
    assert.deepEqual(await page.evaluate(() => window.__inkbridgeIntegrated.errors), []);
    console.log(JSON.stringify({ data, titleAndCover: true, coverIsWorkspaceFile: true, playsThroughLocalPlayer: true, markerAtTime: Math.round(marked.timeStamp * 10) / 10, markerScreenshot: true, pinOpensAtTime: true, restart: true }));
  } catch (error) { await page?.screenshot({ path: path.join(data, 'youtube-failure.png') }).catch(() => {}); console.error({ data }); console.error(error); process.exitCode = 1; }
  finally { await app.close().catch(() => {}); }
})();
