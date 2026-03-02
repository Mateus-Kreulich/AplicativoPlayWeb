const CACHE_NAME = "dragonpoint-v9";
const SW_VERSION = "v9";
const urlsToCache = [
  "./",
  "./index.html",
  "./offline.html",
  "./styles.css",
  "./manifest.json",
  "./state-schema.js",
  "./app-logic.js",
  "./ui-utils.js",
  "./app-ui.js",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isDocument = request.mode === "navigate" || url.pathname.endsWith("index.html") || url.pathname === "/";

  if (isDocument) {
    event.respondWith(networkFirst(event));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(event) {
  const { request } = event;
  const cache = await caches.open(CACHE_NAME);
  try {
    const preloadResponse = await event.preloadResponse;
    if (preloadResponse) {
      if (preloadResponse.ok) {
        cache.put(request, preloadResponse.clone());
      }
      return preloadResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cachedResponse = await cache.match(request);
    return cachedResponse || cache.match("./offline.html") || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  const networkPromise = fetch(request)
    .then(response => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  const networkResponse = await networkPromise;
  return cachedResponse || networkResponse || Response.error();
}

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ type: "SW_ACTIVATED", version: SW_VERSION }));
  })());
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
