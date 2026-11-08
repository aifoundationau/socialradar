// AdRadarHQ Service Worker for PWA Offline & Install Support
// v2: caches the generated /manifest.webmanifest (public/manifest.json was a duplicate and is gone).
const CACHE_NAME = "adradar-pwa-v2";
const STATIC_ASSETS = [
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest"
];

const OFFLINE_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<title>Offline - AdRadarHQ</title></head>' +
  '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0e17;color:#e2e8f0;font-family:system-ui,sans-serif;text-align:center;padding:24px">' +
  "<div><h1 style=\"font-size:20px;margin:0 0 8px\">You're offline</h1>" +
  '<p style="margin:0;opacity:.8">AdRadarHQ needs a connection. Check your internet and try again.</p></div></body></html>';

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  // Leave other origins (Firebase, Google sign-in, Stripe, ad images) to the browser.
  if (url.origin !== self.location.origin) return;
  // Skip API calls and Firebase auth helpers
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/__")) return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      // Pages were never cached, so show a small offline page instead of a broken load.
      if (event.request.mode === "navigate") {
        return new Response(OFFLINE_HTML, {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      return Response.error();
    })
  );
});
