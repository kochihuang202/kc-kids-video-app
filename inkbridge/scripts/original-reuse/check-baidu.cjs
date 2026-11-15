// Real Electron check for Baidu NetDisk video cards (REG-160; src/main/baidu-disk.cjs,
// apply-baidu-patches.cjs, original-shell.mjs services). Never contacts Baidu: a local fake
// Baidu (device-code login, list, search, filemetas, ad-token stream, subtitles) serves a
// synthetic HLS video made by ffmpeg; the app keys are fake. Flow: dialog has only
// local/remote/baidu tabs → authorize (device code, one pending poll) → file list → import
// (default cover from Baidu's thumbnail, REG-162) →
// the panel player streams the HLS through the ad token → marker with a frame screenshot →
// restart keeps login and card → logout clears the token.
const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), http = require('node:http'), assert = require('node:assert/strict'), { execFileSync } = require('node:child_process');
const APP = { appKey: 'FakeAppKey0000000000000000000001', secretKey: 'FakeSecretKey00000000000000000001' };
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-')), media = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-baidu-fixture-'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=duration=12:size=640x360:rate=25', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '25', '-f', 'hls', '-hls_time', '4', '-hls_playlist_type', 'vod', '-hls_segment_filename', path.join(media, 'seg%d.ts'), path.join(media, 'index.m3u8')], { windowsHide: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=duration=1:size=320x180:rate=1', '-frames:v', '1', path.join(media, 'thumb.jpg')], { windowsHide: true });
  const log = []; let polls = 0, origin = '';
  const files = [{ fs_id: 9001, server_filename: '課程', path: '/課程', size: 0, server_mtime: 1700000000, isdir: 1 }, { fs_id: 123, server_filename: 'lesson.mp4', path: '/lesson.mp4', size: 4096000, server_mtime: 1700000000, isdir: 0 }];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, origin), q = url.searchParams, send = (body, type = 'application/json') => { res.writeHead(200, { 'content-type': type }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
    let body = ''; for await (const chunk of req) body += chunk; const f = new URLSearchParams(body);
    log.push(url.pathname + (q.get('method') ? ':' + q.get('method') : '') + (q.get('type') ? ':' + q.get('type') : '') + (q.get('adToken') ? ':ad' : ''));
    if (url.pathname === '/oauth/2.0/device/code') return send(q.get('client_id') === APP.appKey ? { device_code: 'dev-1', user_code: 'abcd1234', verification_url: origin + '/device', qrcode_url: origin + '/qr', expires_in: 300, interval: 1 } : { error: 'invalid_client' });
    if (url.pathname === '/oauth/2.0/token') { if (f.get('client_id') !== APP.appKey || f.get('client_secret') !== APP.secretKey) return send({ error: 'invalid_client' }); if (f.get('grant_type') === 'device_token') return send(++polls < 2 ? { error: 'authorization_pending' } : { access_token: 'tok-1', refresh_token: 'ref-1', expires_in: 2592000 }); return send({ error: 'unsupported' }); }
    if (url.pathname.startsWith('/rest/2.0/xpan/') && q.get('access_token') !== 'tok-1') return send({ errno: -6 });
    if (q.get('method') === 'list') return send({ errno: 0, list: q.get('dir') === '/' ? files : [] });
    if (q.get('method') === 'search') return send({ errno: 0, list: files.filter(row => row.server_filename.includes(q.get('key'))) });
    if (q.get('method') === 'filemetas') return send(q.get('fsids') !== '[123]' ? { errno: 42 } : { errno: 0, list: [{ fs_id: 123, path: '/lesson.mp4', dlink: origin + '/dl/123', ...q.get('thumb') === '1' ? { thumbs: { url1: origin + '/thumb/123-s.jpg', url3: origin + '/thumb/123.jpg' } } : {} }] });
    if (q.get('method') === 'streaming' && q.get('type') === 'M3U8_SUBTITLE_SRT') return send('#EXTM3U\n', 'application/vnd.apple.mpegurl');
    if (q.get('method') === 'streaming' && q.get('path') !== '/lesson.mp4') return send({ errno: 31066 });
    if (q.get('method') === 'streaming') { if (!q.get('adToken')) return send({ errno: 133, adTime: 1, adToken: 'ad-1', ltime: 1 }); const list = (await fs.readFile(path.join(media, 'index.m3u8'), 'utf8')).replace(/^(seg\d+\.ts)$/gm, origin + '/seg/$1'); return send(list, 'application/vnd.apple.mpegurl'); }
    if (url.pathname === '/thumb/123.jpg') return send(await fs.readFile(path.join(media, 'thumb.jpg')), 'image/jpeg');
    if (url.pathname.startsWith('/seg/')) return send(await fs.readFile(path.join(media, path.basename(url.pathname))), 'video/mp2t');
    res.writeHead(404); res.end();
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done)); origin = 'http://127.0.0.1:' + server.address().port;
  const env = { ...process.env, INKBRIDGE_ORIGINAL_PROBE_DATA: data, INKBRIDGE_ORIGINAL_VIEW: 'board', INKBRIDGE_BAIDU_TEST_ORIGIN: origin }; delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => _electron.launch({ args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env });
  let app = await launch(), page; const errors = [], consoleLines = [];
  const start = async () => { page = await app.firstWindow(); page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleLines.push(m.text().slice(0, 300)); }); await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready); };
  const t = key => page.evaluate(key => window.__originalRequire(1643).ag.t(key, { ns: 'common' }), key), load = () => page.evaluate(() => window.inkbridge.load());
  const service = (name, payload) => page.evaluate(([name, payload]) => globalThis.__inkbridgeServices.call(name, payload), [name, payload]);
  const panel = () => page.locator('#original-flow-outline');
  try {
    await start();
    await app.evaluate(async ({ safeStorage, app }, [file, dir, keys]) => process.mainModule.require(file).createBaiduDisk({ dir, safeStorage }).setApp(keys), [path.resolve(__dirname, '../../src/main/baidu-disk.cjs'), path.join(data, 'Profile'), APP]);
    assert.equal(await service('get-baidudisk-access_token'), null, 'not logged in yet');
    // 1. Dialog: local / remote / baidu only.
    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('tablist') });
    await page.mouse.click(301, 536); await page.getByText(/^(視頻|视频)$/).first().click(); await page.mouse.click(520, 250); await expect(dialog).toBeVisible();
    assert.equal(await dialog.getByRole('tab').count(), 3, 'three source tabs');
    await dialog.getByRole('tab').nth(2).click();
    // 2. Authorize: device code, one pending poll, then the original modal lists the files.
    await dialog.getByRole('button', { name: await t('authorizeBaiduDisk') }).click();
    await expect(dialog.getByText('lesson.mp4', { exact: true })).toBeVisible({ timeout: 20000 });
    assert(log.includes('/oauth/2.0/device/code') && polls >= 2, 'device-code login with a pending poll');
    // 3. Search, then import the video.
    await dialog.getByPlaceholder(await t('searchFiles')).fill('lesson'); await expect.poll(() => log.filter(l => l.endsWith(':search')).length).toBeGreaterThan(0);
    await dialog.getByText('lesson.mp4', { exact: true }).click();
    await dialog.getByRole('button', { name: await t('import'), exact: true }).click(); await expect(dialog).toBeHidden();
    let graph; await expect.poll(async () => { graph = await load(); return graph.cardMetadata.some(m => m.platform === 'baidudisk'); }).toBe(true);
    const meta = graph.cardMetadata.find(m => m.platform === 'baidudisk'), content = graph.contents.find(c => c.id === meta.id);
    assert.equal(meta.fileId, '123'); assert.equal(content.title, 'lesson.mp4'); assert.equal(meta.path, '/lesson.mp4');
    assert.equal((await service('get-all-baidudisk-media-cards')).length, 1, 'imported card is listed as already imported');
    // Default cover right after import, before any playback: Baidu's thumbnail (REG-162).
    await expect.poll(async () => (await load()).cardMetadata.find(m => m.platform === 'baidudisk').cover || '', { timeout: 15000 }).not.toBe('');
    assert(log.includes('/thumb/123.jpg'), 'cover came from the Baidu thumbnail');
    graph = await load(); const thumbCover = graph.cardMetadata.find(m => m.platform === 'baidudisk').cover; assert((graph.files || []).some(f => f.id === thumbCover), 'cover is a workspace file');
    // 4. Right panel: the player streams through the ad token; a marker stores a frame.
    await page.keyboard.press('Escape'); await page.mouse.click(700, 850);
    await page.locator('#original-top-views button').filter({ has: page.getByText(await t('highlight'), { exact: true }) }).first().click();
    await panel().getByText('lesson.mp4', { exact: true }).first().click();
    const add = panel().getByRole('button', { name: new RegExp(await t('addMarker')) }); await expect(add).toBeVisible();
    const panelVideo = () => page.evaluate(() => { const v = document.querySelector('#original-flow-outline video'); return v ? { ready: v.readyState, w: v.videoWidth, t: v.currentTime } : null; });
    // With its cover the panel starts on the cover; the marker starts the player (as for local videos).
    assert.equal(await panelVideo(), null, 'panel starts on the cover');
    await add.click();
    await expect.poll(async () => ((await load()).videoHighlights || []).length, { timeout: 30000 }).toBe(1);
    await expect.poll(async () => (await panelVideo())?.ready || 0, { timeout: 30000 }).toBeGreaterThanOrEqual(2);
    graph = await load(); const marker = graph.videoHighlights[0];
    assert(marker.timeStamp >= 0 && marker.timeStamp <= (await panelVideo()).t + 0.5, 'marker at the player time');
    assert(marker.screenshotFileId && (graph.files || []).some(f => f.id === marker.screenshotFileId), 'marker has a frame screenshot');
    assert(log.includes('/rest/2.0/xpan/file:streaming:M3U8_AUTO_720') && log.includes('/rest/2.0/xpan/file:streaming:M3U8_AUTO_720:ad'), 'stream fetched with the ad token');
    assert(log.some(l => l.startsWith('/seg/')), 'HLS segments loaded by the player');
    const played = await page.evaluate(() => { const v = [...document.querySelectorAll('#original-flow-outline video')][0]; return v ? { ready: v.readyState, w: v.videoWidth } : null; });
    assert(played && played.ready >= 2 && played.w === 640, 'panel video decoded: ' + JSON.stringify(played));
    assert.equal((await load()).cardMetadata.find(m => m.platform === 'baidudisk').cover, thumbCover, 'playback keeps the default cover');
    // 4b. 紀錄 on the playing board card opens the record page, which streams from Baidu instead of
    // looking for a local file (REG-163).
    await page.evaluate(() => { const u = window.__originalRequire(22676); window.__originalRequire(63268).Z.dispatch(u.yn({ view: u.XM.whiteboard })); });
    await page.evaluate(() => window.__inkbridgeIntegrated.controls.setViewport({ zoom: .4, x: 0, y: 0 })); await page.waitForTimeout(600);
    const boardCard = await page.evaluate(() => { const s = window.__originalRequire(23).gt.getState(), n = s.nodes.find(n => n.type === 'MediaCard' && n.data?.platform === 'baidudisk'), rect = (s.containerElement || s.canvasElement).getBoundingClientRect(); return { x: rect.x + (n.position.x + (n.width || 400) / 2) * s.view.scale + s.view.translateX, y: rect.y + (n.position.y + (n.height || 300) / 2) * s.view.scale + s.view.translateY }; });
    const record = page.locator('[data-inkbridge-video-record]');
    if (!await record.isVisible().catch(() => false)) await page.mouse.click(boardCard.x, boardCard.y);
    await expect(record).toBeVisible({ timeout: 20000 }); await record.click();
    await expect(page.locator('#inkbridge-video-record-page')).toBeVisible();
    await expect.poll(() => page.evaluate(() => { const v = document.querySelector('#inkbridge-video-record-page video'); return v ? v.readyState : 0; }), { timeout: 30000 }).toBeGreaterThanOrEqual(2);
    assert.equal(await page.locator('#inkbridge-video-missing').count(), 0, 'no "file not found" for a Baidu card');
    // 5. Restart keeps the login and the card; logout clears the token.
    await page.waitForTimeout(500); await app.close(); app = await launch(); await start();
    assert.equal(await service('get-baidudisk-access_token'), 'tok-1', 'login kept (encrypted on this computer)');
    assert((await load()).cardMetadata.some(m => m.platform === 'baidudisk'));
    const stored = await fs.readFile(path.join(data, 'Profile', 'baidu-token.json'), 'utf8'), storedApp = await fs.readFile(path.join(data, 'Profile', 'baidu-app.json'), 'utf8');
    assert(!stored.includes('tok-1') && !storedApp.includes(APP.secretKey), 'token and keys are stored encrypted');
    await service('logout-baidudisk'); assert.equal(await service('get-baidudisk-access_token'), null);
    assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => window.__inkbridgeIntegrated.errors), []);
    console.log(JSON.stringify({ data, tabs: 3, deviceLogin: true, list: true, search: true, imported: true, adTokenStream: true, markerScreenshot: true, recordPageStreams: true, restartKeepsLogin: true, encrypted: true, logout: true }));
  } catch (error) { await page?.screenshot({ path: path.join(data, 'baidu-failure.png') }).catch(() => {}); console.error(JSON.stringify({ data, log: log.slice(-30), console: consoleLines.slice(-15) })); console.error(error); process.exitCode = 1; }
  finally { await app.close().catch(() => {}); server.close(); await fs.rm(media, { recursive: true, force: true }); }
})();
