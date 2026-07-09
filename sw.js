const CACHE_NAME = "gymxbook-v30";
const ASSETS = [
  "index.php",
  "assets/css/style.css",
  "assets/js/app.js",
  "manifest.json",
  "payment-done.html",
];

// Install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }),
  );
  self.skipWaiting();
});

// Activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
    }),
  );
  self.clients.claim();
});

// Fetch - Network first, fallback to cache
self.addEventListener("fetch", (event) => {
  // Skip non-GET and API calls
  if (event.request.method !== "GET") return;
  if (event.request.url.includes("api.php")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      }),
  );
});
