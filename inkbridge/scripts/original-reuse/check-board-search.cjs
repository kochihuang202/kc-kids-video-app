// Real Electron check for the original whiteboard keyword search:
// original 46979.ZP search button -> ui.keywordSearchPanelParams -> complete
// original 42713.h panel -> ui.keywordSearchHighlight -> original Canvas drawer.
// Uses a temporary synthetic workspace only.
const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict'), sharp = require('sharp');
(async () => {
    const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-'));
    // INKBRIDGE_TEST_BUILD: run the same flow against a completed portable build, copied
    // outside the source checkout with its own runtime and an isolated LOCALAPPDATA.
    const candidate = process.env.INKBRIDGE_TEST_BUILD;
    let env, entry = path.join(__dirname, 'host.cjs'), executable = require('electron'), privateRoot = path.resolve(__dirname, '../../private-original-editor');
    if (candidate) {
        const installation = path.join(data, 'Install');
        await fs.cp(path.join(candidate, 'app'), path.join(installation, 'app'), { recursive: true, errorOnExist: true, force: false, dereference: false });
        await fs.copyFile(path.join(candidate, 'portable-build.json'), path.join(installation, 'portable-build.json'));
        entry = path.join(installation, 'app/scripts/original-reuse/host.cjs'); executable = path.join(path.resolve(candidate), 'runtime/electron.exe'); privateRoot = data;
        env = { ...process.env, LOCALAPPDATA: path.join(data, 'Local'), INKBRIDGE_PORTABLE: '1', INKBRIDGE_ORIGINAL_VIEW: 'board' };
        for (const name of ['NODE_PATH', 'NODE_OPTIONS', 'INKBRIDGE_ORIGINAL_PROBE_DATA']) delete env[name];
    }
    else env = { ...process.env, INKBRIDGE_ORIGINAL_PROBE_DATA: data, INKBRIDGE_ORIGINAL_VIEW: 'board' };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await _electron.launch({ args: [entry], executablePath: executable, env });
    let page;
    try {
        page = await app.firstWindow();
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        await app.evaluate(({ app }) => app.focus({ steal: true }));
        await page.bringToFront();
        const ids = await page.evaluate(() => {
            const before = new Set(window.__inkbridgeIntegrated.inspect().nodes.map(n => n.id));
            window.__inkbridgeIntegrated.addCard('First match', 'needle ZEBRAKEY in the first card', { x: 40, y: 40 });
            window.__inkbridgeIntegrated.addCard('No match', 'this card has unrelated text', { x: 1600, y: 40 });
            window.__inkbridgeIntegrated.addCard('Second match', 'far away zebrakey lower case', { x: 3200, y: 1800 });
            return window.__inkbridgeIntegrated.flush().then(() => window.__inkbridgeIntegrated.inspect().nodes.filter(n => !before.has(n.id)).map(n => n.id));
        });
        assert.equal(ids.length, 3);
        const t = key => page.evaluate(key => window.__originalRequire(1643).ag.t(key, { ns: 'common' }), key);
        const ui = () => page.evaluate(() => { const s = window.__originalRequire(63268).Z.getState().ui; return { params: s.keywordSearchPanelParams, highlight: s.keywordSearchHighlight }; });
        const view = () => page.evaluate(() => window.__inkbridgeIntegrated.inspect().view);
        const searchLabel = await t('Search'), placeholder = await t('inputKeywords');
        const button = page.locator('#original-native-tools .react-flow__panel').getByRole('button', { name: searchLabel, exact: true });
        await expect(button).toHaveCount(1);
        await expect(button).toBeEnabled();
        const input = page.getByPlaceholder(placeholder, { exact: true });
        await expect(input).toHaveCount(0);

        // Open through the original button; original payload is whiteboard search without replace.
        await button.click();
        await expect(input).toBeVisible();
        await expect(input).toBeFocused();
        let state = await ui();
        assert.equal(state.params.show, true);
        assert.equal(state.params.isWhiteboardSearch, true);
        assert.equal(state.params.hideReplace, true);
        assert.equal(state.params.position, '.react-flow');
        await expect(page.getByRole('button', { name: await t('replace'), exact: true })).toHaveCount(0);
        const mounted = await page.evaluate(placeholder => { const el = document.querySelector('input[placeholder="' + placeholder + '"]'), flow = document.querySelector('.react-flow'); return { inFlow: !!flow && flow.contains(el), box: el.getBoundingClientRect().toJSON(), flow: flow?.getBoundingClientRect().toJSON() }; }, placeholder);
        assert(mounted.inFlow, 'panel must mount in the original .react-flow position');
        assert(mounted.box.right <= mounted.flow.right && mounted.box.bottom <= mounted.flow.bottom && mounted.box.width > 0);

        // Type a keyword: original 300ms debounce, case-insensitive match of card content.
        const viewBefore = await view(), timings = {};
        // The bottom strip holding the original panel and control bars is excluded.
        // Count the original drawer's keyword-highlight pixels actually painted on the Canvas.
        const orange = async file => { const full = await page.locator('#board').boundingBox(), box = { ...full, height: full.height - 140 }, png = await page.screenshot({ clip: box, ...(file ? { path: path.join(privateRoot, file) } : {}) }), { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true }); let n = 0; for (let i = 0; i < data.length; i += info.channels) { const r = data[i], g = data[i + 1], b = data[i + 2]; if (r > 225 && g > 150 && g < 225 && b < 150) n++; } return n; };
        // The mouse never hovers a card here, so every card stays in the original static layer.
        const painted = async file => { const start = Date.now(); await expect.poll(() => orange(), { timeout: 15000 }).toBeGreaterThan(300); await orange(file); return Date.now() - start; };
        await input.pressSequentially('ZEBRAKEY');
        await expect.poll(async () => (await ui()).highlight?.nodeIds?.length).toBe(2);
        state = await ui();
        assert.deepEqual([...state.highlight.nodeIds].sort(), [ids[0], ids[2]].sort());
        assert.equal(state.highlight.keyword, 'ZEBRAKEY');
        assert.equal(state.highlight.currentIndex, 0);
        // The original panel fits the current match (duration 200, maxZoom 1).
        const centered = id => page.evaluate(id => { const s = window.__originalRequire(23).gt.getState(), n = s.nodes.find(n => n.id === id), rect = (s.containerElement || s.canvasElement).getBoundingClientRect(); return { dx: (n.position.x + n.width / 2) * s.view.scale + s.view.translateX - rect.width / 2, dy: (n.position.y + n.height / 2) * s.view.scale + s.view.translateY - rect.height / 2, scale: s.view.scale }; }, id);
        const settle = async id => { await expect.poll(async () => Math.abs((await centered(id)).dx)).toBeLessThan(2); const c = await centered(id); assert(Math.abs(c.dy) < 2 && c.scale <= 1 + 1e-9, JSON.stringify(c)); };
        await settle(state.highlight.nodeIds[0]);
        assert.notDeepEqual(await view(), viewBefore);
        timings.first = await painted('board-search-first.png');

        // Enter -> next match; wraps around after the last one.
        await input.press('Enter');
        await expect.poll(async () => (await ui()).highlight?.currentIndex).toBe(1);
        await settle(state.highlight.nodeIds[1]);
        timings.second = await painted('board-search-second.png');
        await input.press('Enter');
        await expect.poll(async () => (await ui()).highlight?.currentIndex).toBe(0);
        // Original previous / next buttons.
        // The original icon buttons carry tooltips only; order is previous, next, close.
        const panelButtons = input.locator('xpath=ancestor::div[contains(@class,"select-none")][1]').locator('button');
        await expect(panelButtons).toHaveCount(3);
        await panelButtons.nth(0).click();
        await expect.poll(async () => (await ui()).highlight?.currentIndex).toBe(1);

        // No result: highlight cleared.
        await input.fill('NOSUCHWORDXYZ');
        await expect.poll(async () => (await ui()).highlight).toBe(null);
        await expect.poll(() => orange(), { timeout: 15000 }).toBe(0);

        // Escape in the input closes the panel (original onKeyDown).
        await input.fill('zebrakey');
        await expect.poll(async () => (await ui()).highlight?.nodeIds?.length).toBe(2);
        await input.press('Escape');
        await expect(input).toHaveCount(0);
        assert.equal((await ui()).params.show, false);
        // Original 42713 input Escape only dispatches Tx(show:false); its own cleanup effect is
        // unmounted with it, so the stored highlight is recorded here rather than asserted.
        const highlightAfterEscape = (await ui()).highlight;

        // The original button toggles: open, then close.
        await button.click();
        await expect(input).toBeVisible();
        assert.equal(await input.inputValue(), '');
        await button.click();
        await expect(input).toHaveCount(0);
        assert.equal((await ui()).params.show, false);

        // The original close button clears keyword, highlight and panel.
        await button.click();
        await input.pressSequentially('zebrakey');
        await expect.poll(async () => (await ui()).highlight?.nodeIds?.length).toBe(2);
        await input.locator('xpath=ancestor::div[contains(@class,"select-none")][1]').locator('button').nth(2).click();
        await expect(input).toHaveCount(0);
        await expect.poll(async () => (await ui()).highlight).toBe(null);
        await expect.poll(() => orange(), { timeout: 15000 }).toBe(0);

        // Search never writes: graph content unchanged by the whole flow.
        await page.evaluate(() => window.__inkbridgeIntegrated.flush());
        const graph = await page.evaluate(() => window.inkbridge.load());
        assert.equal(graph.contents.filter(c => /zebrakey/i.test(JSON.stringify(c.body))).length, 2);
        assert.deepEqual(await page.evaluate(() => window.__inkbridgeIntegrated.errors), []);
        console.log(JSON.stringify({ portableBuild: candidate ? JSON.parse(await fs.readFile(path.join(candidate, 'portable-build.json'), 'utf8')).version : null, originalButton: true, originalPanel: true, matches: 2, navigation: true, noResult: true, escapeClose: true, highlightKeptAfterEscape: !!highlightAfterEscape, closeButtonClears: true, toggleClose: true, errors: 0, highlightPainted: true, highlightCleared: true, highlightPaintMs: timings }));
    }
    catch (e) {
        console.error(e);
        if (page && !page.isClosed())
            await page.screenshot({ path: path.join(privateRoot, 'board-search-failure.png') }).catch(() => { });
        await app.evaluate(({ app }) => app.exit(1)).catch(() => { });
        throw e;
    }
    finally {
        await app.close().catch(() => { });
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
