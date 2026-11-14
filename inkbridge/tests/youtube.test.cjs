// src/main/youtube.cjs without network: allowed hosts, player page, metadata from oEmbed and
// the thumbnail (fake fetch), and input validation.
const test = require('node:test'), assert = require('node:assert/strict');
const { createYoutube, YOUTUBE_HOSTS, VIDEO_ID } = require('../src/main/youtube.cjs');
test('only the hosts the embedded YouTube player needs are allowed', () => {
  for (const url of ['https://www.youtube.com/iframe_api', 'https://www.youtube.com/embed/M7lc1UVf-VE', 'https://i.ytimg.com/vi/x/hqdefault.jpg', 'https://rr3---sn-abc.googlevideo.com/videoplayback?x', 'https://yt3.ggpht.com/a', 'https://www.gstatic.com/x.js', 'https://jnn-pa.googleapis.com/$rpc', 'https://www.google.com/js/th/abc.js'])
    assert(YOUTUBE_HOSTS.test(url), url);
  for (const url of ['https://googleads.g.doubleclick.net/pagead/id', 'https://www.google.com/search?q=x', 'https://evil.com/youtube.com/', 'http://www.youtube.com/', 'https://youtube.com.evil.com/', 'https://www.googleapis.com/youtube/v3/videos'])
    assert(!YOUTUBE_HOSTS.test(url), url);
  assert(VIDEO_ID.test('M7lc1UVf-VE')); assert(!VIDEO_ID.test('../../etc')); assert(!VIDEO_ID.test('short'));
});
test('player page on 127.0.0.1 only, and oEmbed metadata with a downloaded cover', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), asked = [];
  const fetch = async url => { asked.push(url); if (url.startsWith('https://www.youtube.com/oembed')) return new Response(JSON.stringify({ title: '範例影片' }), { headers: { 'content-type': 'application/json' } }); if (url.includes('maxresdefault')) return new Response('', { status: 404 }); return new Response(jpeg); };
  const yt = createYoutube({ fetch });
  try {
    const origin = await yt.start(); assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/); assert.equal(await yt.start(), origin, 'one server');
    const page = await (await globalThis.fetch(origin + '/player?v=M7lc1UVf-VE')).text(); assert.match(page, /youtube\.com\/iframe_api/); assert.match(page, /__ytShim/);
    assert.equal((await globalThis.fetch(origin + '/other')).status, 404);
    const meta = await yt.meta('M7lc1UVf-VE');
    assert.equal(meta.title, '範例影片'); assert.equal(meta.coverDataUrl, 'data:image/jpeg;base64,' + jpeg.toString('base64'));
    assert(asked[0].includes(encodeURIComponent('https://www.youtube.com/watch?v=M7lc1UVf-VE'))); assert(asked.some(u => u.endsWith('/hqdefault.jpg')), 'falls back to hqdefault');
    await assert.rejects(yt.meta('not-an-id'), /無效/);
  } finally { yt.close(); }
});
