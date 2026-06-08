const CACHE_NAME = "fatboy-admin-pwa-v2"
const CACHE_PREFIX = "fatboy-admin-pwa-"
const STATIC_ASSETS = [
  "/pwa/employee-icon-192.png",
  "/pwa/employee-icon-512.png",
  "/pwa/employee-apple-touch-180.png"
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting())
  }
})

function offlineResponse() {
  return new Response("Sin conexion. Vuelve a abrir Fatboy cuando el servicio este disponible.", {
    status: 503,
    statusText: "Offline",
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
  })
}

function fetchWithoutHttpCache(request) {
  return fetch(new Request(request, { cache: "no-store" }))
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetchWithoutHttpCache(request))
    return
  }

  if (request.mode === "navigate" && url.pathname.startsWith("/admin")) {
    event.respondWith(
      fetchWithoutHttpCache(request).catch(() => offlineResponse())
    )
    return
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(fetchWithoutHttpCache(request))
    return
  }

  if (url.pathname.endsWith(".webmanifest")) {
    event.respondWith(fetchWithoutHttpCache(request))
    return
  }

  if (url.pathname.startsWith("/pwa/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fresh = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
            }
            return response
          })
          .catch(() => cached)
        return cached || fresh
      })
    )
  }
})
