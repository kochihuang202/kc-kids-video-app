// Real Electron check for video record phase two: the whiteboard's right panel 高亮 tab
// (original 41.iM → tU list, nA media view, 79719 panel), the embedded player's markers,
// dragging a highlight to the board (original 94700.KT → video-highlight-instance), the
// card's 📍 (original openVideoInSidebar), removal paths, restart, and the left 高亮 page
// (original 63526), the automatic cover at 10% (42454 patch) and the bottom-right settings
// popover with only its filename switch connected. Synthetic fixture and temporary workspace only.
const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
(async () => {
    const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-')), media = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-video-fixture-'));
    const file = path.join(media, '課程影片 sample.mp4'); require('../../tests/helpers/video-fixture.cjs')(file);
    const env = { ...process.env, INKBRIDGE_ORIGINAL_PROBE_DATA: data, INKBRIDGE_ORIGINAL_VIEW: 'board' }; delete env.ELECTRON_RUN_AS_NODE;
    const evidence = path.resolve(__dirname, '../../private-original-editor');
    const launch = () => _electron.launch({ args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env });
    let app = await launch(), page; const errors = [];
    const start = async () => { page = await app.firstWindow(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message)); await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready); await app.evaluate(({ app }) => app.focus({ steal: true })); await page.bringToFront(); };
    const t = key => page.evaluate(key => window.__originalRequire(1643).ag.t(key, { ns: 'common' }), key), load = () => page.evaluate(() => window.inkbridge.load());
    const ui = () => page.evaluate(() => window.__originalRequire(63268).Z.getState().ui);
    const panel = () => page.locator('#original-flow-outline'), row = id => panel().locator('[data-video-marker-id="' + id + '"]');
    const panelVideo = () => page.evaluate(() => { const host = document.querySelector('#original-flow-outline').getBoundingClientRect(), v = [...document.querySelectorAll('video')].find(v => v.getBoundingClientRect().x >= host.x - 1); return v ? { t: v.currentTime, ready: v.readyState } : null; });
    const cards = () => page.evaluate(() => window.__originalRequire(23).gt.getState().nodes.filter(n => n.type === 'VideoHighlight').map(n => ({ id: n.id, objectId: n.data.objectId, video: n.data.videoCard?.title || null })));
    const topTab = async key => { await page.locator('#original-top-views button').filter({ has: page.getByText(await t(key), { exact: true }) }).first().click(); };
    const addMarker = async () => { const before = ((await load()).videoHighlights || []).length; await panel().getByRole('button', { name: new RegExp(await t('addMarker')) }).click(); await expect.poll(async () => ((await load()).videoHighlights || []).length).toBe(before + 1); };
    try {
        await start();
        // 1. A video card through the original toolbar placement and dialog.
        const dialog = page.getByRole('dialog').filter({ has: page.getByRole('tablist') });
        // The toolbar's media button (its popover holds 圖片／視頻／音頻).
        await page.mouse.click(301, 536); await page.getByText(/^(視頻|视频)$/).first().click(); await page.mouse.click(520, 250); await expect(dialog).toBeVisible();
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), dialog.getByText(await t('videoModal.dropTitle'), { exact: true }).click()]); await chooser.setFiles(file);
        await dialog.locator('button').filter({ hasText: /^(創建|创建|Create)$/ }).last().click(); await expect(dialog).toBeHidden();
        await expect.poll(async () => (await load()).contents.some(row => row.kind === 'video')).toBe(true);
        let graph = await load(); const content = graph.contents.find(row => row.kind === 'video');
        // Automatic cover at 10% of the 30s fixture, captured from a hidden copy (42454 patch).
        await expect.poll(async () => (await load()).cardMetadata.find(row => row.id === content.id)?.cover || '', { timeout: 20000 }).not.toBe('');
        graph = await load(); const coverId = graph.cardMetadata.find(row => row.id === content.id).cover;
        assert.match((graph.files || []).find(row => row.id === coverId)?.name || '', /-3(\.\d+)?\.png$/, 'automatic cover is the frame at 3s');
        assert.equal(await page.evaluate(() => document.querySelectorAll('[data-inkbridge-cover-probe]').length), 0, 'the hidden cover video is removed');
        await page.keyboard.press('Escape'); await page.mouse.click(700, 820);

        // 2. Right panel 高亮: original list, then the video with its embedded highlight panel.
        await topTab('highlight'); await expect.poll(async () => (await ui()).flowSidebarView).toBe('highlight');
        await panel().getByText(content.title, { exact: true }).first().click();
        await expect(panel().getByRole('button', { name: new RegExp(await t('addMarker')) })).toBeVisible();
        assert.equal(await panelVideo(), null, 'the embedded player starts on its cover');

        // 3. Marker before the player exists: it is started and the exact time is stored (no 00:00).
        await addMarker();
        const started = await panelVideo(); assert(started && started.ready >= 1, 'marker started the embedded player');
        graph = await load(); const first = graph.videoHighlights[0]; assert(Math.abs(first.timeStamp - started.t) < 0.3, 'first marker uses the player time'); assert(first.screenshotFileId, 'first marker has a screenshot');
        await page.evaluate(async () => { const host = document.querySelector('#original-flow-outline').getBoundingClientRect(), v = [...document.querySelectorAll('video')].find(v => v.getBoundingClientRect().x >= host.x - 1); v.pause(); v.currentTime = 7.36; await new Promise(done => { v.onseeked = done; setTimeout(done, 1500); }); });
        await addMarker();
        graph = await load(); const second = graph.videoHighlights.find(row => row.id !== first.id); assert(Math.abs(second.timeStamp - 7.36) < 0.05, 'second marker at 7.36s, got ' + second.timeStamp);

        // 4. Drag the second highlight by its original handle onto the board.
        const handle = row(second.id).locator('button[class*="cursor-grab"]'); await expect(handle).toBeVisible();
        const box = await handle.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(500, 700, { steps: 12 }); await page.mouse.move(450, 720, { steps: 6 }); await page.mouse.up();
        await expect.poll(async () => ((await load()).videoHighlightInstances || []).length).toBe(1);
        graph = await load(); const placement = graph.videoHighlightInstances[0]; assert.equal(placement.objectId, second.id); assert.equal(placement.whiteboardId, graph.boards[0].id);
        await expect.poll(cards).toEqual([{ id: placement.id, objectId: second.id, video: content.title }]);
        await page.screenshot({ path: path.join(evidence, 'video-highlight-board.png') });

        // 5. 📍 on the card header: the side panel opens the video at the highlight's time and focuses it.
        await page.evaluate(() => { const u = window.__originalRequire(22676); window.__originalRequire(63268).Z.dispatch(u.yn({ view: u.XM.whiteboard })); });
        const pin = await page.evaluate(() => { const s = window.__originalRequire(23).gt.getState(), n = s.nodes.find(n => n.type === 'VideoHighlight'), rect = (s.containerElement || s.canvasElement).getBoundingClientRect(), w = n.measured?.width || n.width || 400; return { x: rect.x + (n.position.x + w - 14 - 70 + 11) * s.view.scale + s.view.translateX, y: rect.y + (n.position.y + 17) * s.view.scale + s.view.translateY }; });
        await page.mouse.click(pin.x, pin.y);
        await expect.poll(async () => (await ui()).flowSidebarView).toBe('media');
        await expect.poll(async () => { const v = await panelVideo(); return v && v.ready >= 1 ? Math.abs(v.t - second.timeStamp) < 0.3 : false; }, { timeout: 12000 }).toBe(true);
        await expect(row(second.id)).toBeInViewport();
        await page.screenshot({ path: path.join(evidence, 'video-highlight-pin.png') });

        // 5b. Bottom-right settings (original 46979 popover): only the file-name switches are connected;
        // image and video are separate and saved per board (media-file-names.mjs, REG-157).
        await page.keyboard.press('Escape'); await page.mouse.click(700, 820);
        const fileNameTitle = '顯示影片檔名';
        await page.locator('button[aria-label="' + await t('settings') + '"]').click();
        await expect(page.locator('[data-slot=content]').getByText(fileNameTitle, { exact: true })).toBeVisible();
        await expect.poll(() => page.evaluate(title => { const pop = [...document.querySelectorAll('[data-slot=content]')].find(p => p.textContent.includes(title)), all = [...pop.querySelectorAll('button,input,select,textarea,[role=slider]')]; return { total: all.length > 5, enabled: all.filter(c => !c.disabled).length }; }, fileNameTitle)).toEqual({ total: true, enabled: 2 });
        const otherUi = () => page.evaluate(() => { const u = window.__originalRequire(63268).Z.getState().ui; return JSON.stringify([u.canvasBackground, u.showHelperLines, u.focusModeEnabled, u.showCardPropertiesOnCanvas]); });
        const uiBefore = await otherUi(); await page.locator('[data-slot=content] label').filter({ hasText: /^點$/ }).click({ force: true }).catch(() => {}); assert.equal(await otherUi(), uiBefore, 'a disabled setting does nothing');
        await page.locator('[data-slot=content] div[class*=justify-between]').filter({ hasText: fileNameTitle }).locator('label').first().click();
        await expect.poll(async () => (await page.evaluate(() => window.inkbridge.load())).boards.some(b => b.attributes?.inkbridgeMediaFileNames?.video === true)).toBe(true);
        await page.keyboard.press('Escape'); await page.mouse.click(700, 820);

        // 6. Restart: the card comes back with its highlight and source video; the filename setting is kept.
        await app.close(); app = await launch(); await start();
        await expect.poll(cards).toEqual([{ id: placement.id, objectId: second.id, video: content.title }]);
        assert.equal(await page.evaluate(() => globalThis.__inkbridgeMediaFileName('video', {})), true, 'video file-name setting kept for the board after restart');

        // 7. Remove the card from the board: the placement goes, the highlight stays.
        await page.evaluate(id => { const s = window.__originalRequire(23).gt.getState(); s.setSelectedNodeIds(new Set([id])); }, placement.id);
        await page.mouse.click(700, 820); await page.evaluate(id => window.__originalRequire(23).gt.getState().setSelectedNodeIds(new Set([id])), placement.id);
        await page.keyboard.press('Delete');
        await expect.poll(async () => ((await load()).videoHighlightInstances || []).length).toBe(0);
        assert.equal((await load()).videoHighlights.filter(row => !row.isTrashed).length, 2, 'removing a card keeps its highlight');
        await expect.poll(cards).toEqual([]);
        // Original undo restores the placement; delete it again.
        await page.keyboard.press('Control+z');
        await expect.poll(async () => ((await load()).videoHighlightInstances || []).length).toBe(1);
        await expect.poll(async () => (await cards()).map(card => card.objectId)).toEqual([second.id]);
        await page.evaluate(id => window.__originalRequire(23).gt.getState().setSelectedNodeIds(new Set([id])), (await cards())[0].id); await page.keyboard.press('Delete');
        await expect.poll(async () => ((await load()).videoHighlightInstances || []).length).toBe(0); await expect.poll(cards).toEqual([]);

        // 8. Delete a highlight that is on the board: its card leaves the board.
        await page.evaluate(() => window.__originalRequire(63268).Z.dispatch(window.__originalRequire(22676).yn({ view: window.__originalRequire(22676).XM.highlight })));
        if (!(await ui()).rightSidebarShow) await page.locator('#toggle-outline').click();
        await panel().getByText(content.title, { exact: true }).first().click(); await expect(row(first.id)).toBeVisible();
        const handle2 = row(first.id).locator('button[class*="cursor-grab"]'), box2 = await handle2.boundingBox();
        await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2); await page.mouse.down(); await page.mouse.move(500, 650, { steps: 12 }); await page.mouse.move(420, 660, { steps: 6 }); await page.mouse.up();
        await expect.poll(async () => (await cards()).length).toBe(1);
        await row(first.id).hover(); await row(first.id).locator('button:has(svg.lucide-trash-2)').click();
        const confirm = page.getByRole('dialog').filter({ hasText: await t('Confirm Deletion') }); await expect(confirm).toBeVisible(); await confirm.locator('footer button').last().click();
        await expect.poll(async () => (await cards()).length).toBe(0);
        assert((await load()).videoHighlights.find(row => row.id === first.id).isTrashed);

        // 9. Left 高亮: original page lists the video; audio upload is not connected.
        await page.locator('#original-sidebar-navigation').getByText(await t('highlight'), { exact: true }).click();
        await expect(page.locator('#original-board-home').getByText(content.title, { exact: true })).toBeVisible();
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#original-board-home button')].filter(b => b.disabled).map(b => b.textContent.trim())), [await t('Upload Audio')]);
        await page.locator('#original-board-home').getByText(content.title, { exact: true }).click();
        await expect(page.locator('#inkbridge-video-record-page')).toBeVisible();
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ rightHighlightTab: true, panelMarkerStartsPlayer: true, exactPanelMarkers: true, dragToBoard: true, cardSourceVideo: true, pinOpensAtTime: true, restart: true, removeCardKeepsHighlight: true, undoRestoresCard: true, deleteHighlightRemovesCard: true, leftHighlightPage: true, coverAtTenPercent: true, settingsOnlyFileName: true, fileNameKept: true, errors: 0 }));
    } catch (error) { await page?.screenshot({ path: path.join(evidence, 'video-highlight-board-failure.png') }).catch(() => {}); console.error(error); process.exitCode = 1; }
    finally { await app.close(); }
})();
