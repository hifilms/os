const CACHE_NAME = 'my-smart-cache-v1';
const STATIC_FILES = [
    '/',
    '/index.html'
];

// ইনস্টল এবং মেইন ফাইল সেভ করা
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_FILES);
        })
    );
    self.skipWaiting();
});

// ফেচিং এবং ডাইনামিক ক্যাশিং (ইমেজ ও অন্যান্য ফাইল অটো সেভ হবে)
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            const fetchPromise = fetch(event.request).then(networkResponse => {
                // যদি রেসপন্স ঠিক থাকে তবে ক্যাশে কপি সেভ করো
                if (networkResponse && networkResponse.status === 200) {
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, networkResponse.clone());
                    });
                }
                return networkResponse;
            }).catch(() => {
                // ইন্টারনেট না থাকলে যদি ক্যাশে থাকে তবে সেটিই দাও
                return cachedResponse;
            });

            return cachedResponse || fetchPromise;
        })
    );
});

// পুরনো ক্যাশ ডিলিট করা
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
});