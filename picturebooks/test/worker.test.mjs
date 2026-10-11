import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.mjs';

test('serves the bookshelf and deep links through static assets', async () => {
  for (const path of ['/', '/catalog.json', '/book/hurry-up']) {
    const response = await worker.fetch(new Request(`https://books.test${path}`), {
      ASSETS: { fetch: async () => new Response('static') },
    }, { waitUntil() {} });
    assert.equal(await response.text(), 'static');
  }
});

test('missing images return an image error rather than the app shell', async () => {
  const response = await worker.fetch(new Request('https://books.test/media/books/04/missing.webp'), {
    BOOK_IMAGES: { get: async () => null },
  }, { waitUntil() {} });
  assert.equal(response.status, 404);
});

test('serves R2 image bytes with immutable caching and supports HEAD', async () => {
  const env = { BOOK_IMAGES: {
    get: async () => ({ body: 'image-bytes', httpEtag: '"image-etag"', size: 11,
      writeHttpMetadata(headers) { headers.set('content-type', 'image/webp'); } }),
  } };
  const response = await worker.fetch(new Request('https://books.test/media/books/04/01-hash.webp'), env, { waitUntil() {} });
  assert.equal(await response.text(), 'image-bytes');
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.match(response.headers.get('cache-control'), /immutable/);
  const head = await worker.fetch(new Request('https://books.test/media/books/04/01-hash.webp', { method: 'HEAD' }), env, { waitUntil() {} });
  assert.equal(await head.text(), '');
  const unchanged = await worker.fetch(new Request('https://books.test/media/books/04/01-hash.webp', { headers: { 'if-none-match': '"image-etag"' } }), env, { waitUntil() {} });
  assert.equal(unchanged.status, 304);
});
