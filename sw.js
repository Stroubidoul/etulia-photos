// Etulia Photos — service worker. Coquille (page, css, js, icônes) en cache ;
// vignettes/photos : cache après première vue (max ~400 entrées).
// À chaque modification visible : bumper CACHE (et ?v= dans index.html / app.js).
const CACHE = 'etulia-photos-v2';
const IMG_CACHE = 'etulia-photos-img-v1';
const SHELL = ['./', './index.html', './manifest.json', './css/app.css?v=2', './js/app.js?v=2', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== IMG_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('.supabase.co') && !url.pathname.startsWith('/storage/')) return;   // API : réseau
  if (url.origin === self.location.origin) {
    const isNav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
    if (isNav) { e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((k) => k.put('./index.html', c)); return r; }).catch(() => caches.match('./index.html'))); return; }
    e.respondWith(caches.match(req).then((h) => h || fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((k) => k.put(req, c)); return r; })));
    return;
  }
  if (url.hostname === 'techzone.etulia.fr' || url.pathname.startsWith('/storage/') || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(url.hostname === 'techzone.etulia.fr' || url.pathname.startsWith('/storage/') ? IMG_CACHE : CACHE).then(async (c) => {
      const hit = await c.match(req); if (hit) return hit;
      const r = await fetch(req); if (r.ok) { c.put(req, r.clone()); trimImgCache(c); } return r;
    }).catch(() => caches.match(req)));
  }
});
let trimming = false;
async function trimImgCache(c) {
  if (trimming) return; trimming = true;
  try { const keys = await c.keys(); if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) await c.delete(k); } finally { trimming = false; }
}
