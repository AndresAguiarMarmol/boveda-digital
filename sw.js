// sw.js – en la raíz del proyecto
const CACHE_NAME = 'boveda-digital-v23';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './assets/css/vault.css',
    './assets/js/app.js',
    './assets/js/auth.js',
    './assets/js/crypto.js',
    './assets/js/storage.js',
    './assets/js/license.js',
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
                    await cache.add(new Request(asset, { cache: 'reload' }));
                } catch (err) {
                    console.warn('[SW] No se pudo cachear recurso:', asset, err);
                }
            }
        })
    );
    self.skipWaiting();
});
// Activación – limpiar cachés obsoletos
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});
// Fetch – Estrategia Network-First con cache: 'no-store' para código de la app,
// garantizando que los iPhones/celulares reciban actualizaciones en cuanto estén conectados.
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;

    // Solo interceptar peticiones HTTP/HTTPS del mismo origen o relativas
    const url = new URL(e.request.url);
    const isSameOrigin = url.origin === self.location.origin;

    if (isSameOrigin) {
        e.respondWith(
            fetch(e.request, { cache: 'no-store' })
                .then(networkRes => {
                    // Guardar copia fresca en caché para modo offline
                    if (networkRes && networkRes.status === 200) {
                        const copy = networkRes.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(e.request, copy));
                    }
                    return networkRes;
                })
                .catch(() => caches.match(e.request, { ignoreSearch: true }))
        );
    } else {
        // Recursos de terceros (CDNs): Cache-First
        e.respondWith(
            caches.match(e.request).then(cached => cached || fetch(e.request))
        );
    }
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
