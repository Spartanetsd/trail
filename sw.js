// MOBILITY ZERO — sw.js
// Офлайн-кеш. Після будь-яких змін у файлах збільште VERSION — інакше телефони триматимуть стару версію.

const VERSION = 'mz-1.0.0';
const ASSETS = [
  './', './index.html', './styles.css',
  './app.js', './engine.js', './store.js', './ui.js', './charts.js', './assistant.js', './sheets.js',
  './view-home.js', './view-compare.js', './view-calendar.js', './view-savings.js', './view-settings.js',
  './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './favicon-32.png',
  './tests.html', './tests.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('mz-') && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Спершу кеш (миттєвий запуск і робота без інтернету), потім мережа. Зовнішні сайти не перехоплюються.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const net = await fetch(req);
      if (net.ok && net.type === 'basic') cache.put(req, net.clone());
      return net;
    } catch (err) {
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});
