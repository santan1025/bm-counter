// BM Ventures — offline cache. Bump CACHE_V after any change to any app file.
// Network-first: a republished update is picked up on the next load, and the cache is only
// the offline fallback. A shop with a dead SIM must still be able to open the till.
const CACHE_V = 'bm-v43-02';
const ASSETS = [
  './', './index.html', './login.html',
  './counter-manager-v20.html', './chef.html', './kitchen.html', './owner.html',
  './sync.js', './session.js', './supabase-config.js', './check.html', './recover.html',
  './display.html', './display.js', './qr.js',
  './manifest.json', './404.html',
  './icon-192.png', './icon-512.png', './icon-maskable-192.png', './icon-maskable-512.png'
];

self.addEventListener('install', e => {
  // addAll fails the whole install if any single file 404s, which would leave the phone
  // with no service worker at all — so each asset is cached independently.
  e.waitUntil(caches.open(CACHE_V).then(c =>
    Promise.all(ASSETS.map(a => c.add(a).catch(() => {})))
  ).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_V).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Never cache the Supabase API. A stale sales list served from cache is worse than an
  // error, because nobody would know it was stale.
  if (url.hostname.endsWith('.supabase.co')) return;
  // The keys file is never served from cache. An old copy of it — from before the keys were
  // put in — is indistinguishable from no keys at all, and the app then asks the shop to set
  // up a connection it already has.
  if (/supabase-config\.js$/.test(url.pathname)) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE_V).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
