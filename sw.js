// Service Worker: يجعل التطبيق قابلاً للتثبيت ويعمل بلا إنترنت.
// الشبكة أولاً (لتصل التحديثات فور نشرها) ثم النسخة المخزنة عند انقطاع الاتصال.
// طلبات قاعدة البيانات (Supabase) وأسعار الصرف لا تُخزَّن هنا أبداً.
const CACHE = 'mizan-v2';
const SHELL = ['./', 'index.html', 'app.css', 'manifest.webmanifest', 'icon.svg', 'icon-192.png',
  'app.js', 'config.js', 'store.js', 'calc.js', 'schema.js', 'ui.js', 'tx.js', 'views1.js', 'views2.js', 'views3.js'];
const CDN = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  const own = url.origin === self.location.origin, cdn = CDN.includes(url.hostname);
  if (!own && !cdn) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (cdn) { // المكتبات والخطوط: المخزن أولاً ثم تحديث في الخلفية
      const hit = await cache.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') cache.put(req, r.clone()); return r; }).catch(() => null);
      return hit || (await net) || Response.error();
    }
    try { const r = await fetch(req); if (r.ok) cache.put(req, r.clone()); return r; }
    catch { return (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await cache.match('index.html') : Response.error()); }
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => (cs[0] ? cs[0].focus() : self.clients.openWindow('./#calendar'))));
});
