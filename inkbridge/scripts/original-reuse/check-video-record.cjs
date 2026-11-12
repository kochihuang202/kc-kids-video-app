// Real Electron check for path-linked local video cards and the record page:
// original 67569 dialog -> own link boundary -> original 47766 overlay / 59771 player ->
// original 81072 page + 79719 highlight panel -> own SQLite highlights and screenshots.
// Synthetic ffmpeg fixture and a temporary workspace only.
const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
(async () => {
    const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-')), media = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-video-fixture-'));
    const file = path.join(media, '課程影片 sample.mp4'), moved = path.join(media, '搬家後 moved.mp4');
    require('../../tests/helpers/video-fixture.cjs')(file);
    const env = { ...process.env, INKBRIDGE_ORIGINAL_PROBE_DATA: data, INKBRIDGE_ORIGINAL_VIEW: 'board' }; delete env.ELECTRON_RUN_AS_NODE;
    const evidence = path.resolve(__dirname, '../../private-original-editor');
    const launch = () => _electron.launch({ args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env });
    let app = await launch(), page;
    const start = async () => { page = await app.firstWindow(); page.setDefaultTimeout(10000); await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready); await app.evaluate(({ app }) => app.focus({ steal: true })); await page.bringToFront(); };
    const t = key => page.evaluate(key => window.__originalRequire(1643).ag.t(key, { ns: 'common' }), key), load = () => page.evaluate(() => window.inkbridge.load());
    const highlights = async () => ((await load()).videoHighlights || []).filter(row => !row.isTrashed).sort((a, b) => a.timeStamp - b.timeStamp);
    const pageVideo = () => page.evaluate(() => { const v = document.querySelector('.video-page-container video'); return v ? { ready: v.readyState, time: v.currentTime, paused: v.paused, cross: v.crossOrigin, error: v.error?.code || null } : null; });
    const setTime = value => page.evaluate(value => { const v = document.querySelector('.video-page-container video'); v.pause(); v.currentTime = value; return new Promise(done => { v.onseeked = () => done(); setTimeout(done, 1500); }); }, value);
    // A real press and release on the card centre; the original Canvas opens its video overlay.
    const openCard = async () => { const at = await page.evaluate(() => { const s = window.__originalRequire(23).gt.getState(), n = s.nodes.find(n => n.type === 'MediaCard'), rect = (s.containerElement || s.canvasElement).getBoundingClientRect(); return { x: rect.x + (n.position.x + n.width / 2) * s.view.scale + s.view.translateX, y: rect.y + (n.position.y + n.height / 2) * s.view.scale + s.view.translateY }; }); await page.mouse.move(at.x - 30, at.y - 20, { steps: 4 }); await page.mouse.move(at.x, at.y, { steps: 4 }); await page.mouse.down(); await page.waitForTimeout(90); await page.mouse.up(); await expect(page.locator('[data-video-overlay-content]')).toBeVisible(); };
    const openRecord = async () => { const button = page.locator('[data-inkbridge-video-record]'); await expect(button).toHaveCount(1); await button.click(); await expect(page.locator('#inkbridge-video-record-page')).toBeVisible(); };
    const panel = () => page.locator('#original-flow-outline'), rows = () => panel().locator('[data-video-marker-id]'), row = id => panel().locator('[data-video-marker-id="' + id + '"]');
    try {
        await start();
        // 1. Insert through the original blank-canvas menu and the original video dialog.
        const board = await page.locator('#board').boundingBox();
        await page.evaluate(() => window.__inkbridgeIntegrated.controls.setViewport({ x: 300, y: 120, zoom: .6 }));
        await page.mouse.click(board.x + board.width * .3, board.y + board.height * .25, { button: 'right' });
        await page.getByText(await t('newVideoCard'), { exact: true }).first().click();
        const dialog = page.getByRole('dialog').filter({ has: page.getByRole('tablist') });
        await expect(dialog).toBeVisible();
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), dialog.getByText(await t('videoModal.dropTitle'), { exact: true }).click()]);
        await chooser.setFiles(file);
        await expect(dialog.getByText(path.basename(file), { exact: true })).toBeVisible();
        await dialog.locator('button').filter({ hasText: /^(創建|创建|Create)$/ }).last().click();
        await expect(dialog).toBeHidden();
        let graph = await load(); const content = graph.contents.find(row => row.kind === 'video'), card = graph.cardMetadata.find(row => row.id === content?.id);
        assert(content && card, 'video card must be stored');
        assert.equal(card.type, 'video'); assert.equal(card.platform, 'local'); assert.equal(card.path, file); assert.equal(card.fileSuffix, 'mp4'); assert.match(card.fileId, /^[a-f0-9]{64}$/);
        assert.equal((graph.files || []).length, 0, 'a linked video must not enter the attachment catalog');
        assert.deepEqual(await fs.readdir(path.join(data, 'files')), [], 'a linked video must not be copied into the attachment store');
        assert.equal(graph.instances.filter(row => row.contentId === content.id).length, 1);

        // 2. Play on the board through the original overlay; direct record entry, no "more" menu.
        await openCard();
        await expect.poll(() => page.evaluate(() => { const v = document.querySelector('[data-video-overlay-content] video'); return v ? v.readyState : -1; })).toBeGreaterThanOrEqual(2);
        const overlay = await page.evaluate(() => { const v = document.querySelector('[data-video-overlay-content] video'); return { src: v.currentSrc, duration: Math.round(v.duration), cross: v.crossOrigin, labels: [...document.querySelectorAll('[data-video-overlay-content] button')].map(b => b.getAttribute('aria-label') || '') }; });
        assert.equal(overlay.src, `flexnote://file/${card.fileId}.mp4`); assert.equal(overlay.duration, 30); assert.equal(overlay.cross, 'anonymous');
        for (const key of ['Open in Sidebar', 'openInModal', 'openInFloating']) assert(!overlay.labels.includes(await t(key)));
        await page.screenshot({ path: path.join(evidence, 'video-record-board.png') });

        // 3. Record page: original page + highlight panel by default, subtitles still reachable.
        await openRecord();
        await expect.poll(async () => (await pageVideo())?.ready).toBeGreaterThanOrEqual(2);
        assert.deepEqual(await page.evaluate(() => { const ui = window.__originalRequire(63268).Z.getState().ui; return { view: ui.viewDefaultView, shown: ui.rightSidebarShow }; }), { view: 'video-highlight', shown: true });
        await expect(panel().getByRole('button', { name: new RegExp(await t('addMarker')) })).toBeVisible();
        const fit = () => page.evaluate(() => { const host = document.querySelector('#inkbridge-video-record-page').getBoundingClientRect(), v = document.querySelector('.video-page-container video').getBoundingClientRect(), side = document.querySelector('#original-flow-outline').getBoundingClientRect(); return { inside: v.left >= host.left - 1 && v.right <= host.right + 1 && v.top >= host.top - 1 && v.bottom <= host.bottom + 1, clear: host.right <= side.left + 2 }; });
        await expect.poll(fit).toEqual({ inside: true, clear: true });
        await page.locator('[data-inkbridge-video-view="video-subtitles"]').click();
        await expect.poll(() => page.evaluate(() => window.__originalRequire(63268).Z.getState().ui.viewDefaultView)).toBe('video-subtitles');
        await page.locator('[data-inkbridge-video-view="video-highlight"]').click();
        await expect(panel().getByRole('button', { name: new RegExp(await t('addMarker')) })).toBeVisible();

        // 4. Five seek controls, usable while paused and while playing.
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('[data-inkbridge-seek]')].map(b => b.dataset.inkbridgeSeek)), ['-5', '-1', '1', '5']);
        await page.waitForTimeout(500); await setTime(10);
        const seek = async (delta, expected) => { await page.locator(`[data-inkbridge-seek="${delta}"]`).click(); await expect.poll(async () => Math.abs((await pageVideo()).time - expected)).toBeLessThan(.05); };
        await seek(5, 15); await seek(1, 16); await seek(-1, 15); await seek(-5, 10);
        await page.evaluate(() => document.querySelector('.video-page-container video').play());
        await expect.poll(async () => (await pageVideo()).paused).toBe(false);
        const playing = (await pageVideo()).time; await page.locator('[data-inkbridge-seek="5"]').click();
        await expect.poll(async () => (await pageVideo()).time).toBeGreaterThan(playing + 4.5);

        // 5. Marker: exact time at the press (not the 1s polled value), automatic screenshot.
        await setTime(7.36);
        await panel().getByRole('button', { name: new RegExp(await t('addMarker')) }).click();
        await expect(rows()).toHaveCount(1);
        await expect.poll(async () => (await highlights()).length).toBe(1);
        let [first] = await highlights(); graph = await load();
        assert(Math.abs(first.timeStamp - 7.36) < .001, 'marker time ' + first.timeStamp); assert.equal(first.sourceId, card.fileId);
        const screenshot = graph.files.find(row => row.id === first.screenshotFileId); assert(screenshot && screenshot.type === 'png' && screenshot.size > 1000, 'marker screenshot must be a stored PNG');
        await expect.poll(() => row(first.id).locator('img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
        // Marking while playing pauses and still records the exact position.
        await setTime(20); await page.evaluate(() => document.querySelector('.video-page-container video').play());
        await expect.poll(async () => (await pageVideo()).time).toBeGreaterThan(20.6);
        await panel().getByRole('button', { name: new RegExp(await t('addMarker')) }).click();
        await expect(rows()).toHaveCount(2);
        await expect.poll(async () => (await highlights()).length).toBe(2);
        const second = (await highlights())[1], paused = await pageVideo();
        assert.equal(paused.paused, true); assert(Math.abs(second.timeStamp - paused.time) < .001, `playing marker ${second.timeStamp} vs ${paused.time}`);
        // 6. Notes are edited in the original Lexical editor of the row and persisted.
        const editor = row(first.id).locator('[contenteditable=true]').first();
        await editor.click(); await page.keyboard.insertText('KEYFRAME 關鍵畫面筆記');
        await expect.poll(async () => JSON.stringify((await highlights())[0].notes || '')).toContain('KEYFRAME 關鍵畫面筆記');
        // 7. Clicking a marker's time seeks the player to it.
        await setTime(2);
        await row(first.id).locator('span.font-mono').first().click();
        await expect.poll(async () => Math.abs((await pageVideo()).time - first.timeStamp)).toBeLessThan(.05);
        // The top view strip names the side panel that is actually shown (highlight, not whiteboard).
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#original-top-views [role=tab][aria-selected=true]')].map(tab => tab.textContent.trim())), [await t('highlight')]);
        // 8. Delete through the original row button and its confirmation: soft delete, screenshot kept.
        await row(second.id).hover(); await row(second.id).locator('button:has(svg.lucide-trash-2)').click();
        const confirm = page.getByRole('dialog').filter({ hasText: await t('Confirm Deletion') }); await expect(confirm).toBeVisible();
        await confirm.locator('footer button').last().click();
        await expect(rows()).toHaveCount(1);
        await expect.poll(async () => (await highlights()).length).toBe(1);
        graph = await load(); assert.equal(graph.videoHighlights.find(item => item.id === second.id).isTrashed, true); assert(graph.files.some(item => item.id === second.screenshotFileId));
        await page.screenshot({ path: path.join(evidence, 'video-record-page.png') });
        await page.evaluate(() => window.__inkbridgeIntegrated.flush());
        assert.deepEqual(await page.evaluate(() => window.__inkbridgeIntegrated.errors), []);
        const before = await highlights();

        // 9. Normal close and reopen: card, highlights, notes and screenshots are exact.
        await app.close(); app = await launch(); await start();
        assert.deepEqual(await highlights(), before);
        await openCard(); await openRecord();
        await expect(rows()).toHaveCount(1);
        await expect(row(first.id)).toContainText('KEYFRAME 關鍵畫面筆記');
        await expect.poll(async () => (await pageVideo())?.ready).toBeGreaterThanOrEqual(2);
        await expect(page.locator('#inkbridge-video-missing')).toHaveCount(0);

        // 10. The file is no longer at its path: notes still open, playback asks to relink.
        await app.close(); await fs.rename(file, moved); app = await launch(); await start();
        await openCard(); await openRecord();
        await expect(page.locator('#inkbridge-video-missing')).toBeVisible();
        await expect(page.locator('#inkbridge-video-missing')).toContainText(file);
        await expect(page.locator('.video-page-container')).toHaveCount(0);
        await expect(rows()).toHaveCount(1);
        await expect(row(first.id)).toContainText('KEYFRAME 關鍵畫面筆記');
        await page.screenshot({ path: path.join(evidence, 'video-record-missing.png') });
        // The native open dialog cannot be driven; answer it in the main process for this test.
        await app.evaluate(({ dialog }, target) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] }); }, moved);
        await page.locator('#inkbridge-video-relink').click();
        await expect(page.locator('#inkbridge-video-missing')).toHaveCount(0);
        await expect.poll(async () => (await pageVideo())?.ready).toBeGreaterThanOrEqual(2);
        graph = await load(); const relinked = graph.cardMetadata.find(row => row.id === content.id);
        const movedId = require('../../src/main/linked-videos.cjs').linkId(moved);
        assert.equal(relinked.path, moved); assert.equal(relinked.fileId, movedId, 'the link identity follows the new path'); assert.notEqual(movedId, card.fileId);
        assert.deepEqual(await highlights(), before.map(row => ({ ...row, sourceId: movedId })), 'relinking keeps every highlight, moved to the new link');
        assert.equal(await page.evaluate(() => document.querySelector('.video-page-container video').currentSrc), 'flexnote://file/' + movedId + '.mp4');
        await expect(rows()).toHaveCount(1);
        assert.deepEqual(await page.evaluate(() => window.__inkbridgeIntegrated.errors), []);
        console.log(JSON.stringify({ linkedByPath: true, boardPlayback: true, recordPage: true, subtitleSwitch: true, seekControls: true, exactMarkerPausedAndPlaying: true, screenshot: true, notes: true, seekFromMarker: true, highlightTab: true, deleteMarker: true, restartExact: true, missingFileKeepsNotes: true, relinkKeepsHighlights: true, errors: 0 }));
    }
    catch (e) { console.error(e); if (page && !page.isClosed()) await page.screenshot({ path: path.join(evidence, 'video-record-failure.png') }).catch(() => { }); await app.evaluate(({ app }) => app.exit(1)).catch(() => { }); throw e; }
    finally { await app.close().catch(() => { }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
