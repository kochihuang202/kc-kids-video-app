const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
(async () => {
    const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-')), env = { ...process.env, INKBRIDGE_ORIGINAL_PROBE_DATA: data, INKBRIDGE_ORIGINAL_VIEW: 'board' };
    delete env.ELECTRON_RUN_AS_NODE;
    const launch = () => _electron.launch({ args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env });
    let app = await launch(), page;
    try {
        page = await app.firstWindow();
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        await app.evaluate(({ app }) => app.focus({ steal: true }));
        await page.bringToFront();
        const left = page.locator('#original-left-frame .resize-handle').first(), box = await left.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + 100);
        await page.mouse.down();
        await expect(page.locator('#original-left-frame .is-resizing')).toBeVisible();
        await page.mouse.move(340, box.y + 100, { steps: 6 });
        await page.mouse.up();
        await expect.poll(() => page.locator('#board').evaluate(el => Math.round(el.getBoundingClientRect().x))).toBe(340);
        await page.evaluate(() => { window.__inkbridgeIntegrated.addCard('Resize card', 'Fixture', { x: 40, y: 40 }); return window.__inkbridgeIntegrated.flush(); });
        await page.locator('#toggle-outline').click();
        await expect(page.locator('#original-flow-outline [role=option]').first()).toBeVisible();
        const handle = page.locator('#original-flow-outline .cursor-ew-resize').first(), right = await handle.boundingBox();
        await expect.poll(() => handle.evaluate(el => { const b = el.getBoundingClientRect(), hit = document.elementFromPoint(b.right - 2, b.y + 100); return el === hit || el.contains(hit); })).toBe(true);
        await page.mouse.move(right.x + right.width - 2, right.y + 100);
        await page.mouse.down();
        await expect.poll(() => page.evaluate(() => window.__originalRequire(63268).Z.getState().ui.isSidebarResizing)).toBe(true);
        await page.mouse.move(680, right.y + 100, { steps: 6 });
        await page.mouse.up();
        await expect.poll(() => page.evaluate(() => window.__originalRequire(63268).Z.getState().ui.flowDetailWidth)).toBe(520);
        await page.evaluate(() => window.__inkbridgeIntegrated.controls.setViewport({ zoom: .2 }));
        await expect.poll(() => page.evaluate(() => window.__originalRequire(63268).Z.getState().ui.onlyDisplayCardTitle)).toBe(true);
        await page.evaluate(() => window.__originalRequire(63268).Z.dispatch(window.__originalRequire(22676).Tx({ show: true, isWhiteboardSearch: true })));
        await expect.poll(() => page.evaluate(() => window.__originalRequire(63268).Z.getState().ui.onlyDisplayCardTitle)).toBe(false);
        await page.evaluate(() => window.__originalRequire(63268).Z.dispatch(window.__originalRequire(22676).Tx({ show: false, isWhiteboardSearch: true })));
        await expect.poll(() => page.evaluate(() => window.__originalRequire(63268).Z.getState().ui.onlyDisplayCardTitle)).toBe(true);
        assert(await page.evaluate(() => { const p = document.querySelector('#original-native-tools .react-flow__panel')?.getBoundingClientRect(), o = document.querySelector('#original-flow-outline')?.getBoundingClientRect(); return p && o && p.right <= o.left; }));
        console.log(JSON.stringify({ geometry: await page.evaluate(() => Object.fromEntries(['#persistence-status', '#original-native-tools .react-flow__panel button', '.original-sidebar'].map(s => { const e = document.querySelector(s), b = e?.getBoundingClientRect(); return [s, b ? { x: b.x, y: b.y, w: b.width, h: b.height, at: document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.id } : null]; }))) }));
        await page.evaluate(() => window.__inkbridgeIntegrated.controls.setViewport({ zoom: 1 }));
        await expect.poll(() => page.evaluate(() => window.__originalRequire(63268).Z.getState().ui.onlyDisplayCardTitle)).toBe(false);
        const origin = new URL(page.url()).origin;
        await page.evaluate(() => window.__inkbridgeIntegrated.flush());
        assert.deepEqual(await page.evaluate(() => window.__inkbridgeIntegrated.errors), []);
        await app.close();
        app = await launch();
        page = await app.firstWindow();
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        assert.equal(new URL(page.url()).origin, origin);
        assert.equal(await page.evaluate(() => localStorage.getItem('sidebar_left_width')), '340');
        assert.equal(await page.evaluate(() => window.__originalRequire(63268).Z.getState().ui.flowDetailWidth), 520);
        console.log(JSON.stringify({ nativeLeftResize: true, nativeRightResize: true, nativeLod: true, sameProfileOrigin: true, widthsRetained: true }));
    }
    catch (e) {
        console.error(e);
        console.log(await page.evaluate(() => Object.fromEntries(['#persistence-status', '#original-native-tools .react-flow__panel button', '.brand', '#original-flow-outline .cursor-ew-resize'].map(s => { const e = document.querySelector(s), b = e?.getBoundingClientRect(); return [s, b ? { x: b.x, y: b.y, w: b.width, h: b.height, at: document.elementFromPoint(b.right - 2, b.y + 100)?.outerHTML.slice(0, 170), parents: Array.from((function* (n) { while (n) {
                    yield n;
                    n = n.parentElement;
                } })(e)).slice(0, 7).map(n => ({ tag: n.tagName, id: n.id, c: n.className, pe: getComputedStyle(n).pointerEvents, z: getComputedStyle(n).zIndex, overflow: getComputedStyle(n).overflow })) } : null]; }))));
        if (page && !page.isClosed())
            await page.screenshot({ path: path.resolve(__dirname, '../../private-original-editor/resize-lod-failure.png') });
        await app.evaluate(({ app }) => app.exit(1)).catch(() => { });
        throw e;
    }
    finally {
        await app.close().catch(() => { });
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
