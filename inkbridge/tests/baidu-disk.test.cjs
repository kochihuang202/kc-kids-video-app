// src/main/baidu-disk.cjs without network: encrypted keys and tokens, device-code login with a
// pending poll, token refresh, ad-token and member streams served through local addresses
// (playlist rewritten, segments with the pan.baidu.com Referer), SRT subtitles, input checks.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { createBaiduDisk, SEGMENT_HOSTS } = require('../src/main/baidu-disk.cjs');
const safeStorage = { encryptString: s => Buffer.from([...Buffer.from(s)].map(b => b ^ 0x5a)), decryptString: b => Buffer.from([...b].map(x => x ^ 0x5a)).toString() };
const KEYS = { appKey: 'AppKey0000000000000000000000001', secretKey: 'Secret000000000000000000000001' };
const reply = body => new Response(typeof body === 'string' ? body : JSON.stringify(body));
test('Referer hosts', () => {
  assert(SEGMENT_HOSTS.test('https://x.baidupcs.com/a')); assert(SEGMENT_HOSTS.test('https://v1-ant.baidu.com/a'));
  for (const u of ['https://pan.baidu.com/a', 'https://evil.com/baidupcs.com/', 'https://baidupcs.com.evil.com/']) assert(!SEGMENT_HOSTS.test(u), u);
});
test('login, refresh, stream and subtitles', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-baidu-test-')); let clock = 1e12, polls = 0; const asked = [];
  const fetch = async (url, init) => {
    const u = new URL(url), q = u.searchParams, f = new URLSearchParams(init?.body || ''); asked.push(u.pathname + ':' + (q.get('method') || f.get('grant_type') || ''));
    if (u.pathname === '/oauth/2.0/device/code') return reply({ device_code: 'd', user_code: 'u', verification_url: 'https://openapi.baidu.com/device', expires_in: 300, interval: 1 });
    if (f.get('grant_type') === 'device_token') return reply(++polls < 2 ? { error: 'authorization_pending' } : { access_token: 'a1', refresh_token: 'r1', expires_in: 3600 });
    if (f.get('grant_type') === 'refresh_token') { assert.equal(f.get('refresh_token'), 'r1'); assert.equal(f.get('client_secret'), KEYS.secretKey); return reply({ access_token: 'a2', refresh_token: 'r2', expires_in: 3600 }); }
    if (q.get('type') === 'M3U8_AUTO_720' && q.get('path') === '/member.mp4') return reply('#EXTM3U\n#EXTINF:4,\nhttps://cdn.baidupcs.com/m0.ts?sign=1\n#EXT-X-ENDLIST\n');
    if (q.get('type') === 'M3U8_AUTO_720' && !q.get('adToken')) return reply({ errno: 133, adToken: 'ad', ltime: 2 });
    if (q.get('type') === 'M3U8_AUTO_720') return new Response('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:4,\nhttps://d.baidupcs.com/s0.ts?x=1\n#EXT-X-ENDLIST\n', { headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
    if (u.hostname.endsWith('baidupcs.com')) { assert.equal(init.headers.Referer, 'https://pan.baidu.com'); assert.equal(init.headers.Range, 'bytes=0-'); return new Response(Buffer.from('TS'), { status: 206, headers: { 'content-type': 'video/mp2t', 'content-range': 'bytes 0-1/2' } }); }
    if (q.get('type') === 'M3U8_SUBTITLE_SRT') return reply('#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="s",NAME="中文",LANGUAGE="zh",DEFAULT=YES\nhttps://pan.baidu.com/sub.srt\n');
    if (u.pathname === '/sub.srt') return reply('1\n00:00:01,000 --> 00:00:02,000\n你好\n\n2\n00:00:03,000 --> 00:00:04,000\n再見\n');
    throw Error('unexpected ' + url);
  };
  const waits = [], opened = [];
  const logs = [], baidu = createBaiduDisk({ dir, safeStorage, fetch, localOrigin: () => 'http://127.0.0.1:9', log: line => logs.push(line), openExternal: url => opened.push(url), now: () => clock, wait: async ms => { waits.push(ms); } });
  try {
    await assert.rejects(baidu.startAuth(), /AppKey/);
    await assert.rejects(baidu.setApp({ appKey: 'x', secretKey: 'y' }), /格式/);
    await baidu.setApp(KEYS); assert(!(await fs.readFile(path.join(dir, 'baidu-app.json'), 'utf8')).includes(KEYS.secretKey));
    const started = await baidu.startAuth(); assert.equal(started.userCode, 'u'); assert.deepEqual(opened, ['https://openapi.baidu.com/device']);
    for (let i = 0; i < 20 && !await baidu.accessToken(); i++) await new Promise(done => setImmediate(done));
    assert.equal(await baidu.accessToken(), 'a1'); assert.equal(polls, 2);
    clock += 3600 * 1000; assert.equal(await baidu.accessToken(), 'a2', 'refreshed when expired');
    const local = await baidu.m3u8('/課程/a.mp4'); assert.match(local, /^http:\/\/127\.0\.0\.1:9\/baidu-media\/[0-9a-f]{24}$/); assert(waits.includes(2000), 'waits the ad time');
    const list = await baidu.serve(local.split('/').pop()); assert.equal(list.status, 200); assert(!list.body.includes('access_token') &&!list.body.includes('baidupcs'), 'no token or Baidu URL reaches the page');
    const refs = [...list.body.matchAll(/127\.0\.0\.1:9\/baidu-media\/([0-9a-f]{24})/g)].map(m => m[1]); assert.equal(refs.length, 2, 'key and segment rewritten');
    const seg = await baidu.serve(refs[1], 'bytes=0-'); assert.equal(seg.status, 206); assert.equal(seg.headers['content-type'], 'video/mp2t'); assert.equal(Buffer.from(await new Response(seg.stream).arrayBuffer()).toString(), 'TS');
    const member = await baidu.serve((await baidu.m3u8('/member.mp4')).split('/').pop()); assert.match(member.body, /^#EXTM3U/, 'member stream: the first answer is the playlist');
    assert.equal((await baidu.serve('0'.repeat(24))).status, 404);
    await assert.rejects(baidu.m3u8('../x'), /路徑/); await assert.rejects(baidu.src('1;2'), /代號/);
    const subs = await baidu.subtitle('/a.mp4'); assert.equal(subs[0].name, '中文'); assert.deepEqual(subs[0].data.map(c => c.text), ['你好', '再見']);
    await baidu.logout(); assert.equal(await baidu.accessToken(), null);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
