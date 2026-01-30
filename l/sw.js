const CACHE_NAME = 'whatsapp-p2p-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/src/app.js',
    '/src/network.js',
    '/src/db.js',
    'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});

// Background Sync Placeholder
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-messages') {
        console.log('Background sync triggered');
        // In a real P2P app, true background sync is hard without a central server,
        // but we can signal the app to try flushing when it awakens.
    }
});
