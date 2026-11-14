// src/main/baidu-disk.cjs without network: encrypted keys and tokens, device-code login with a
// pending poll, token refresh, ad-token stream URL, SRT subtitles, input checks, allowed hosts.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { createBaiduDisk, BAIDU_STREAM_HOSTS, SEGMENT_HOSTS } = require('../src/main/baidu-disk.cjs');
const safeStorage = { encryptString: s => Buffer.from([...Buffer.from(s)].map(b => b ^ 0x5a)), decryptString: b => Buffer.from([...b].map(x => x ^ 0x5a)).toString() };
const KEYS = { appKey: 'AppKey0000000000000000000000001', secretKey: 'Secret000000000000000000000001' };
const reply = body => new Response(typeof body === 'string' ? body : JSON.stringify(body));
test('allowed stream hosts and Referer hosts', () => {
  for (const u of ['https://pan.baidu.com/rest/2.0/xpan/file?method=streaming', 'https://d.pcs.baidupcs.com/x.ts', 'https://v1-ant.baidu.com/seg']) assert(BAIDU_STREAM_HOSTS.test(u), u);
  for (const u of ['https://pan.baidu.com/', 'https://evil.com/baidupcs.com/', 'http://d.baidupcs.com/x', 'https://baidupcs.com.evil.com/']) assert(!BAIDU_STREAM_HOSTS.test(u), u);
  assert(SEGMENT_HOSTS.test('https://x.baidupcs.com/a')); assert(!SEGMENT_HOSTS.test('https://pan.baidu.com/a'));
});
test('login, refresh, stream and subtitles', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-baidu-test-')); let clock = 1e12, polls = 0; const asked = [];
  const fetch = async (url, init) => {
    const u = new URL(url), q = u.searchParams, f = new URLSearchParams(init?.body || ''); asked.push(u.pathname + ':' + (q.get('method') || f.get('grant_type') || ''));
    if (u.pathname === '/oauth/2.0/device/code') return reply({ device_code: 'd', user_code: 'u', verification_url: 'https://openapi.baidu.com/device', expires_in: 300, interval: 1 });
    if (f.get('grant_type') === 'device_token') return reply(++polls < 2 ? { error: 'authorization_pending' } : { access_token: 'a1', refresh_token: 'r1', expires_in: 3600 });
    if (f.get('grant_type') === 'refresh_token') { assert.equal(f.get('refresh_token'), 'r1'); assert.equal(f.get('client_secret'), KEYS.secretKey); return reply({ access_token: 'a2', refresh_token: 'r2', expires_in: 3600 }); }
    if (q.get('type') === 'M3U8_AUTO_720') return reply({ errno: 133, adToken: 'ad', ltime: 2 });
    if (q.get('type') === 'M3U8_SUBTITLE_SRT') return reply('#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="s",NAME="中文",LANGUAGE="zh",DEFAULT=YES\nhttps://pan.baidu.com/sub.srt\n');
    if (u.pathname === '/sub.srt') return reply('1\n00:00:01,000 --> 00:00:02,000\n你好\n\n2\n00:00:03,000 --> 00:00:04,000\n再見\n');
    throw Error('unexpected ' + url);
  };
  const waits = [], opened = [];
  const baidu = createBaiduDisk({ dir, safeStorage, fetch, openExternal: url => opened.push(url), now: () => clock, wait: async ms => { waits.push(ms); } });
  try {
    await assert.rejects(baidu.startAuth(), /AppKey/);
    await assert.rejects(baidu.setApp({ appKey: 'x', secretKey: 'y' }), /格式/);
    await baidu.setApp(KEYS); assert(!(await fs.readFile(path.join(dir, 'baidu-app.json'), 'utf8')).includes(KEYS.secretKey));
    const started = await baidu.startAuth(); assert.equal(started.userCode, 'u'); assert.deepEqual(opened, ['https://openapi.baidu.com/device']);
    for (let i = 0; i < 20 && !await baidu.accessToken(); i++) await new Promise(done => setImmediate(done));
    assert.equal(await baidu.accessToken(), 'a1'); assert.equal(polls, 2);
    clock += 3600 * 1000; assert.equal(await baidu.accessToken(), 'a2', 'refreshed when expired');
    const url = new URL(await baidu.m3u8('/課程/a.mp4')); assert.equal(url.searchParams.get('adToken'), 'ad'); assert.equal(url.searchParams.get('path'), '/課程/a.mp4'); assert(waits.includes(2000), 'waits the ad time');
    await assert.rejects(baidu.m3u8('../x'), /路徑/); await assert.rejects(baidu.src('1;2'), /代號/);
    const subs = await baidu.subtitle('/a.mp4'); assert.equal(subs[0].name, '中文'); assert.deepEqual(subs[0].data.map(c => c.text), ['你好', '再見']);
    await baidu.logout(); assert.equal(await baidu.accessToken(), null);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
