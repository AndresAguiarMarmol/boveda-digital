// sw.js – en la raíz del proyecto
const CACHE_NAME = 'boveda-digital-v1';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './assets/css/vault.css',
    './assets/js/app.js',
    './assets/js/auth.js',
    './assets/js/crypto.js',
    './assets/js/storage.js',
    './assets/js/gdrive.js',
    './assets/img/icon-192.png',
    './assets/img/icon-512.png'
];
// Instalación – cacheamos todo lo necesario
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            for (const asset of ASSETS) {
                try {
                    await cache.add(asset);
                } catch (err) {
                    console.warn('[SW] No se pudo cachear recurso:', asset, err);
                }
            }
        })
    );
    self.skipWaiting();
});
// Activación
self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ));
    self.clients.claim();
});
// Fetch – servir del caché, y si falta, ir a la red
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});
// Background Sync – re intenta la sincronización cuando haya red
self.addEventListener('sync', e => {
    if (e.tag === 'cloud-sync') {
        e.waitUntil(clients.matchAll().then(clients => {
            for (const client of clients) {
                client.postMessage({ type: 'SYNC_REQUEST' });
            }
        }));
    }
});

