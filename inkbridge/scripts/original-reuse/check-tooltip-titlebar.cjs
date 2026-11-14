// Real Electron check: original tooltips in the right panel header (高亮 list: search,
// collapse/expand all, select all) open above their buttons; in InkBridge that area is
// covered by the native window buttons (titleBarOverlay). tooltip-titlebar.mjs moves such a
// tooltip below its button. Synthetic temporary workspace only.
const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
(async () => {
    const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-')), media = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-video-fixture-'));
    const file = path.join(media, 'sample.mp4'); require('../../tests/helpers/video-fixture.cjs')(file);
    const env = { ...process.env, INKBRIDGE_ORIGINAL_PROBE_DATA: data, INKBRIDGE_ORIGINAL_VIEW: 'board' }; delete env.ELECTRON_RUN_AS_NODE;
    const evidence = path.resolve(__dirname, '../../private-original-editor');
    const app = await _electron.launch({ args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env });
    let page;
    try {
        page = await app.firstWindow(); page.setDefaultTimeout(10000); await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        const t = key => page.evaluate(key => window.__originalRequire(1643).ag.t(key, { ns: 'common' }), key), load = () => page.evaluate(() => window.inkbridge.load());
        const panel = () => page.locator('#original-flow-outline');
        // A synthetic video with one marker, so the panel header shows its buttons.
        const dialog = page.getByRole('dialog').filter({ has: page.getByRole('tablist') });
        await page.mouse.click(301, 536); await page.getByText(/^(視頻|视频)$/).first().click(); await page.mouse.click(520, 250); await expect(dialog).toBeVisible();
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), dialog.getByText(await t('videoModal.dropTitle'), { exact: true }).click()]); await chooser.setFiles(file);
        await dialog.locator('button').filter({ hasText: /^(創建|创建|Create)$/ }).last().click(); await expect(dialog).toBeHidden();
        await expect.poll(async () => (await load()).contents.some(row => row.kind === 'video')).toBe(true);
        const content = (await load()).contents.find(row => row.kind === 'video');
        await page.keyboard.press('Escape'); await page.mouse.click(700, 820);
        await page.locator('#original-top-views button').filter({ has: page.getByText(await t('highlight'), { exact: true }) }).first().click();
        await panel().getByText(content.title, { exact: true }).first().click();
        await panel().getByRole('button', { name: new RegExp(await t('addMarker')) }).click();
        await expect.poll(async () => ((await load()).videoHighlights || []).length).toBe(1);
        await page.waitForTimeout(600);
        // Every visible button near the top-right corner (panel header and top bar).
        const spots = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => b.getBoundingClientRect()).filter(r => r.width && r.top < 90 && r.right > innerWidth - 260 && r.top >= 30).map(r => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 })));
        const results = [];
        for (const spot of spots) {
            await page.mouse.move(5, 500); await page.waitForTimeout(250); await page.mouse.move(spot.x, spot.y); await page.waitForTimeout(900);
            const value = await page.evaluate(() => {
                const tip = [...document.querySelectorAll('[role=tooltip]')].pop(); if (!tip) return null;
                const r = tip.getBoundingClientRect(), o = navigator.windowControlsOverlay, bar = o?.visible ? o.getTitlebarAreaRect() : null;
                const controls = bar ? { left: bar.x + bar.width, bottom: bar.y + bar.height } : { left: innerWidth - 150, bottom: 36 };
                return { text: tip.innerText, top: Math.round(r.top), right: Math.round(r.right), overlay: !!o?.visible, moved: tip.dataset.inkbridgeTitlebar || null, covered: r.right > controls.left && r.top < controls.bottom };
            });
            if (value) results.push(value);
        }
        const result = { buttons: spots.length, tips: results };
        await page.screenshot({ path: path.join(evidence, 'tooltip-titlebar.png') });
        console.log(JSON.stringify(result));
        assert.ok(results.length, 'some tooltips were shown');
        assert.deepEqual(results.filter(r => r.covered), [], 'no tooltip is under the native window buttons');
        console.log('tooltip-titlebar: ok');
    } catch (error) { await page?.screenshot({ path: path.join(evidence, 'tooltip-titlebar-failure.png') }).catch(() => {}); console.error(error); process.exitCode = 1; }
    finally { await app.close().catch(() => {}); await fs.rm(data, { recursive: true, force: true }).catch(() => {}); await fs.rm(media, { recursive: true, force: true }).catch(() => {}); }
})();
