const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict'), crypto = require('node:crypto');
(async () => {
    const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-pdf-drop-')), file = path.join(data, '拖入測試.pdf'), bytes = require('../../tests/helpers/pdf-fixture.cjs')(3);
    const large=process.env.INKBRIDGE_TEST_LARGE_PDF==='1';
    if(large)await require('../../tests/helpers/large-pdf-fixture.cjs')(file,512*1024*1024);else await fs.writeFile(file, bytes);
    const expectedSha=await require('../../src/main/stream-files.cjs').hashFile(file);
    const { WorkspaceDatabase } = require('../../src/main/database.cjs'), seed = new WorkspaceDatabase(path.join(data, 'Workspace/inkbridge.sqlite3'));
    seed.commit({ requestId: crypto.randomUUID(), baseRevision: 0, operations: [{ type: 'putBoard', data: { id: 'board-main', title: 'PDF_DROP_BOARD', view: { x: 0, y: 0, zoom: 1 } } }] });
    seed.close();
    const env = { ...process.env, INKBRIDGE_ORIGINAL_PROBE_DATA: data, INKBRIDGE_ORIGINAL_VIEW: 'board' };
    delete env.ELECTRON_RUN_AS_NODE;
    const launch = () => _electron.launch({ args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env });
    let app = await launch(), page;
    try {
        page = await app.firstWindow();
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        if (process.env.INKBRIDGE_DROP_CHILD === '1') {
            await page.evaluate(() => window.__inkbridgeServices.call('openStandaloneWindow', { route: '/zh-TW/flow?whiteboardId=board-main' }));
            await expect.poll(() => app.windows().length).toBe(2);
            page = app.windows().find(p => p !== page);
        }
        page.setDefaultTimeout(8000);
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        await page.evaluate(() => { window.__dropEvents = []; document.addEventListener('dragover', event => window.__dropEvents.push({ type: 'dragover', trusted: event.isTrusted, prevented: event.defaultPrevented, effect: event.dataTransfer.dropEffect, types: [...event.dataTransfer.types] })); document.addEventListener('drop', event => window.__dropEvents.push({ type: 'drop', trusted: event.isTrusted, paths: [...event.dataTransfer.files].map(file => window.ipc.getPathForFile(file)) })); });
        const cdp = await page.context().newCDPSession(page), rect = await page.locator('#board').boundingBox(), x = rect.x + 250, y = rect.y + 230, dragData = { items: [], files: [file], dragOperationsMask: 1 };
        for (const type of ['dragEnter', 'dragOver', 'drop'])
            await cdp.send('Input.dispatchDragEvent', { type, x, y, data: dragData });
        await expect.poll(async () => (await page.evaluate(() => window.inkbridge.load())).contents.filter(c => c.kind === 'pdf').length, { timeout: large?90000:10000 }).toBe(1);
        await page.evaluate(() => window.__inkbridgeIntegrated.flush());
        const graph = await page.evaluate(() => window.inkbridge.load()), pdf = graph.contents.find(c => c.kind === 'pdf'), instance = graph.instances.find(i => i.contentId === pdf.id), fileRecord = graph.files.find(f => f.type === 'pdf');
        assert(instance);
        assert.equal(fileRecord.sha256, expectedSha);
        assert.equal(await require('../../src/main/stream-files.cjs').hashFile(path.join(data,'files',fileRecord.id+'.pdf')),expectedSha);
        const partial=await page.evaluate(async id=>{const r=await fetch('flexnote://file/'+id,{headers:{Range:'bytes=0-4'}});return{status:r.status,length:(await r.arrayBuffer()).byteLength,range:r.headers.get('content-range')};},fileRecord.id);
        assert.equal(partial.status,206);assert.equal(partial.length,5);
        const events = await page.evaluate(() => window.__dropEvents);
        assert(events.some(e => e.type === 'dragover' && e.prevented && e.effect === 'copy'));
        assert(events.some(e => e.type === 'drop' && e.trusted && e.paths.includes(file)));
        await expect.poll(async () => JSON.stringify(await page.evaluate(() => window.__inkbridgeIntegrated.inspect().nodes)).includes(pdf.id)).toBe(true);
        const point = await page.evaluate(id => { const s = window.__inkbridgeIntegrated.inspect(), node = s.nodes.find(n => n.data.objectId === id), b = document.querySelector('#board').getBoundingClientRect(); return { x: b.x + s.view.translateX + (node.position.x + 50) * s.view.scale, y: b.y + s.view.translateY + (node.position.y + 50) * s.view.scale }; }, pdf.id);
        await page.mouse.click(point.x, point.y, { button: 'right' });
        await page.locator('.context-menu-root [data-key=openInPopup]').click();
        await expect(page.locator('.global-modal canvas').first()).toBeVisible({ timeout: 15000 });
        await expect.poll(async () => ((await page.evaluate(() => window.inkbridge.load())).cardMetadata || []).find(row => row.id === pdf.id)?.totalPages).toBe(3);
        assert.deepEqual(await page.evaluate(() => window.__inkbridgeIntegrated.errors), []);
        await app.close();
        app = await launch();
        page = await app.firstWindow();
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        assert((await page.evaluate(() => window.inkbridge.load())).instances.some(i => i.contentId === pdf.id));
        console.log(JSON.stringify({ childWindow: process.env.INKBRIDGE_DROP_CHILD === '1', exact512MiB:large,byteRange:true,nativePdfReader: true, parsedPages: 3, trustedFileDrop: true, nativeCopyCursor: true, realOsPath: true, onePdf: true, casBytes: true, sqliteInstance: true, restart: true, data }));
    }
    catch (error) {
        console.error(error);
        if (page && !page.isClosed())
            console.error(await page.evaluate(() => ({ events: window.__dropEvents, errors: window.__inkbridgeIntegrated.errors })));
        await app.evaluate(({ app }) => app.exit(1)).catch(() => { });
        throw error;
    }
    finally {
        await app.close().catch(() => { });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
