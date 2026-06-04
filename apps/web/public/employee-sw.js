const CACHE_NAME = "fatboy-employee-pwa-v1"
const APP_SHELL = [
  "/",
  "/employee",
  "/pwa/employee-manifest.webmanifest",
  "/pwa/employee-icon-192.png",
  "/pwa/employee-icon-512.png",
  "/pwa/employee-apple-touch-180.png"
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === "navigate" && url.pathname.startsWith("/employee")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put("/employee", copy))
          return response
        })
        .catch(async () => {
          return (await caches.match("/employee")) || (await caches.match("/")) || Response.error()
        })
    )
    return
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/pwa/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fresh = fetch(request)
          .then((response) => {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
            return response
          })
          .catch(() => cached)
        return cached || fresh
      })
    )
  }
})
