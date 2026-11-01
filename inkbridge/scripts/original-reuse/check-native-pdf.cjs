const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
(async () => {
    const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-')), file = path.join(data, 'three-pages.pdf'), bytes = require('../../tests/helpers/pdf-fixture.cjs')(3);
    await fs.writeFile(file, bytes);
    const env = { ...process.env, INKBRIDGE_ORIGINAL_PROBE_DATA: data, INKBRIDGE_ORIGINAL_VIEW: 'board' };
    delete env.ELECTRON_RUN_AS_NODE;
    const launch = () => _electron.launch({ args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env });
    let app = await launch(), page;
    try {
        page = await app.firstWindow();
        page.setDefaultTimeout(7000);
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        await app.evaluate(({ app }) => app.focus({ steal: true }));
        await page.bringToFront();
        const t = key => page.evaluate(key => window.__originalRequire(1643).ag.t(key, { ns: 'common' }), key), load = () => page.evaluate(() => window.inkbridge.load());
        await page.locator('#original-sidebar-navigation').getByRole('tab', { name: await t('card-list'), exact: true }).click();
        await page.locator('#native-new-card').click();
        await page.getByText(await t('newPDFCard'), { exact: true }).click();
        const dialog = page.getByRole('dialog').filter({ hasText: await t('batchPdfUpload.title') });
        await expect(dialog).toBeVisible();
        const chooseLabel = await t('batchPdfUpload.chooseFiles');
        const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), dialog.getByText(chooseLabel, { exact: true }).click({ timeout: 5000 })]);
        await chooser.setFiles(file);
        await expect(dialog.getByText('three-pages.pdf', { exact: true })).toBeVisible();
        await dialog.getByRole('button', { name: await t('batchPdfUpload.confirm').then(text => text.replace('{{count}}', '1')), exact: false }).click();
        await expect(dialog).toBeHidden();
        await expect(page.locator('#original-board-home').getByText('three-pages.pdf', { exact: true })).toBeVisible();
        const graph = await load(), pdf = graph.contents.find(c => c.kind === 'pdf');
        assert(pdf);
        assert.equal(graph.files.find(f => f.type === 'pdf').id, crypto.createHash('sha256').update(bytes).digest('hex'));
        if (!await page.locator('.global-modal').isVisible())
            await page.locator('#original-board-home .card-list-page-item').filter({ hasText: 'three-pages.pdf' }).click();
        await expect(page.locator('.global-modal')).toBeVisible();
        await expect(page.locator('.global-modal canvas').first()).toBeVisible({ timeout: 15000 });
        await expect.poll(async () => ((await load()).cardMetadata || []).find(row => row.id === pdf.id)?.totalPages, { timeout: 15000 }).toBe(3);
        const pageInput = page.locator('.global-modal input[type=number]').first();
        await pageInput.fill('3');
        await pageInput.press('Enter');
        await expect.poll(async () => ((await load()).cardMetadata || []).find(row => row.id === pdf.id)?.currentPage).toBe(3);
        const modalBox = await page.locator('.global-modal').boundingBox();
        await page.mouse.click(modalBox.x - 20, modalBox.y + 100);
        await expect(page.locator('.global-modal')).toBeHidden();
        const item = page.locator('#original-board-home .card-list-page-item').filter({ hasText: 'three-pages.pdf' });
        await item.click({ button: 'right' });
        await page.locator('.context-menu-root').getByText(await t('AddToWhiteboard'), { exact: true }).click();
        await page.getByRole('dialog').getByRole('option', { name: '靈感白板', exact: true }).click();
        await expect.poll(async () => (await load()).instances.some(row => row.contentId === pdf.id)).toBe(true);
        await page.locator('#original-board-list').getByText('靈感白板', { exact: true }).click();
        await expect.poll(() => page.evaluate(id => window.__originalRequire(23).gt.getState().nodes.find(row => row.data.objectId === id)?.data.currentPage, pdf.id)).toBe(3);
        assert.equal(await page.evaluate(id=>window.__originalRequire(23).gt.getState().nodes.find(row=>row.data.objectId===id)?.data.size,pdf.id),bytes.length);
        const point = await page.evaluate(id => { const b = document.querySelector('#board').getBoundingClientRect(), s = window.__originalRequire(23).gt.getState(), n = s.nodes.find(row => row.data.objectId === id); return { x: b.x + s.view.translateX + (n.position.x + 80) * s.view.scale, y: b.y + s.view.translateY + (n.position.y + 80) * s.view.scale }; }, pdf.id);
        await page.mouse.click(point.x, point.y);
        await expect(page.locator('.selection-toolbar-container')).toBeVisible();
        await page.locator('.selection-toolbar-container [aria-label="More options"]').click();
        const sidebarItem = await page.locator('.context-menu-root [data-key=openInSidebar]').boundingBox();
        await page.mouse.click(sidebarItem.x + sidebarItem.width / 2, sidebarItem.y + sidebarItem.height / 2);
        await expect(page.locator('#original-card-sidebar canvas').first()).toBeVisible({ timeout: 15000 });
        await page.screenshot({ path: path.resolve(__dirname, '../../private-original-editor/native-pdf-sidebar.png') });
        await page.locator('#original-card-sidebar .lucide-ellipsis').first().click();
        await page.locator('.context-menu-root').getByText(await t('Open in new tab'), { exact: true }).click();
        await expect(page.locator('#original-board-home canvas').first()).toBeVisible({ timeout: 15000 });
        await expect.poll(() => page.evaluate(() => window.__inkbridgeIntegrated.page)).toBe('pdf');
        await page.evaluate(() => window.__inkbridgeIntegrated.flush());
        await app.close();
        app = await launch();
        page = await app.firstWindow();
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        const reopened = await load();
        assert.equal(reopened.cardMetadata.find(row => row.id === pdf.id).currentPage, 3);
        assert.equal(reopened.files.find(row => row.type === 'pdf').sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
        await expect(page.getByText('元件渲染出錯', { exact: true })).toHaveCount(0);
        assert.deepEqual(await page.evaluate(() => window.__inkbridgeIntegrated.errors), []);
        console.log(JSON.stringify({ nativePdfPicker: true, realCasBytes: true, nativeReaderCanvas: true, actualParsedPageCount: 3, nativePageJump: true, nativeAddToBoard: true, restartPageRetained: true, nativeSidebarReader: true, nativePdfPage: true }));
        await page.screenshot({ path: path.resolve(__dirname, '../../private-original-editor/native-pdf-reader.png') });
    }
    catch (error) {
        console.error(error);
        if (page && !page.isClosed()) {
            console.log((await page.locator('body').innerText()).slice(-2200));
            console.log(JSON.stringify(await page.evaluate(() => ({ errors: window.__inkbridgeIntegrated.errors }))));
            await page.screenshot({ path: path.resolve(__dirname, '../../private-original-editor/native-pdf-failure.png') });
        }
        await app.evaluate(({ app }) => app.exit(1)).catch(() => { });
        throw error;
    }
    finally {
        await app.close().catch(() => { });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
