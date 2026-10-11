export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/media/')) return env.ASSETS.fetch(request);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    const key = url.pathname.slice('/media/'.length);
    if (!/^books\/[a-z0-9-]+\/[a-z0-9-]+\.webp$/.test(key)) return new Response('Not found', { status: 404 });
    const cache = globalThis.caches?.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    let response = cache && await cache.match(cacheKey);
    if (!response) {
      const object = await env.BOOK_IMAGES.get(key);
      if (!object) return new Response('Image not found', { status: 404, headers: { 'cache-control': 'no-store' } });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('content-type', 'image/webp');
      headers.set('etag', object.httpEtag);
      headers.set('cache-control', 'public, max-age=31536000, immutable');
      headers.set('x-content-type-options', 'nosniff');
      response = new Response(object.body, { headers });
      if (cache) ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    if (request.headers.get('if-none-match') === response.headers.get('etag')) return new Response(null, { status: 304, headers: response.headers });
    return request.method === 'HEAD' ? new Response(null, { headers: response.headers }) : response;
  },
};
