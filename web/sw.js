// ═══════════════════════════════════════════════
//  GoShare — Service Worker
//  Offline-first caching strategy
// ═══════════════════════════════════════════════

const CACHE_NAME = "goshare-v1";

// Core assets to cache on install
const PRECACHE_ASSETS = [
    "/",
    "/pages/lan.html",
    "/pages/p2p.html",
    "/pages/404.html",
    "/static/css/shared.css",
    "/static/css/home.css",
    "/static/css/lan.css",
    "/static/css/p2p.css",
    "/static/js/shared.js",
    "/static/js/app.js",
    "/static/js/p2p.js",
    "/static/manifest.json",
    "/static/icons/icon-192.svg",
    "/static/icons/icon-512.svg",
];

// ── Install: Pre-cache core assets ──
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log("[SW] Pre-caching core assets");
            return cache.addAll(PRECACHE_ASSETS);
        })
    );
    // Activate immediately without waiting for old SW to finish
    self.skipWaiting();
});

// ── Activate: Clean up old caches ──
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log("[SW] Deleting old cache:", name);
                        return caches.delete(name);
                    })
            );
        })
    );
    // Take control of all pages immediately
    self.clients.claim();
});

// ── Fetch: Network-first for API, Cache-first for static ──
self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== "GET") return;

    // Skip API calls, SSE, downloads, and health — always go to network
    if (
        url.pathname.startsWith("/api/") ||
        url.pathname.startsWith("/download/") ||
        url.pathname === "/health"
    ) {
        return;
    }

    // Skip external requests (CDN fonts, icons, etc.)
    if (url.origin !== location.origin) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                return (
                    cached ||
                    fetch(event.request).then((response) => {
                        // Cache CDN assets for offline use
                        if (response.ok) {
                            const clone = response.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, clone);
                            });
                        }
                        return response;
                    })
                );
            })
        );
        return;
    }

    // Static assets: Stale-while-revalidate strategy
    // Serve from cache immediately, update cache in background
    event.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.match(event.request).then((cached) => {
                const fetchPromise = fetch(event.request)
                    .then((networkResponse) => {
                        if (networkResponse.ok) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // Network failed — return cached or offline fallback
                        return cached;
                    });

                // Return cached version immediately if available, otherwise wait for network
                return cached || fetchPromise;
            });
        })
    );
});
