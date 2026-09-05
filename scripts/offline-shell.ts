import type { Plugin } from "vite";

// Only immutable app assets and the public shell are cached. Never cache parent
// APIs, credentials, media streams, or arbitrary navigation responses.
export function offlineShell(): Plugin {
  return {
    name: "kids-offline-shell",
    apply: "build",
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter(name => /\.(js|css)$/.test(name)).map(name => `/${name}`);
      const version = files.join("|");
      this.emitFile({ type: "asset", fileName: "offline-sw.js", source: `
const CACHE = 'kids-shell-' + ${JSON.stringify(version)};
const FILES = ${JSON.stringify(["/", ...files])};
self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE)
    .then(cache => cache.addAll(FILES.map(url => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting())
));
self.addEventListener('activate', event => event.waitUntil(Promise.all([
  self.clients.claim(),
  caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('kids-shell-') && key !== CACHE).map(key => caches.delete(key))))
])));
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.open(CACHE)).match('/')));
  } else if (url.pathname.startsWith('/assets/')) {
    // Match across shell caches so an already-controlled tab also survives the
    // short service-worker upgrade window after a new hashed build is deployed.
    // Static hashed assets are immutable; preview/CDN may add Vary: Origin,
    // which must not prevent the same-origin document request matching here.
    event.respondWith(caches.match(request, { ignoreVary: true }).then(async cached => cached || fetch(request)));
  }
});` });
    },
  };
}
