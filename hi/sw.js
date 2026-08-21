const CACHE_NAME = "app-cache-v1";

// অফলাইনে ব্যবহারের জন্য প্রয়োজনীয় সব ফাইলের তালিকা
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",        // আপনার CSS ফাইলের নাম থাকলে
  "./app.js",           // আপনার মূল JavaScript ফাইলের নাম
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// ১. অ্যাপ ইনস্টল করার সময় ফাইলগুলো ক্যাশ করা
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Caching all offline assets...");
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// ২. পুরোনো ক্যাশ মুছে ফেলা (যদি কোনো আপডেট আসে)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("Clearing old cache...");
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// ৩. ইন্টারনেট না থাকলে ক্যাশ থেকে ফাইল লোড করা
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        // নেভিগেশন রিকোয়েস্টের জন্য index.html রিটার্ন করা
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
      });
    })
  );
});