let employeeServiceWorkerRegistered = false
let adminServiceWorkerRegistered = false
let versionWatchStarted = false
let updateAlreadyNotified = false
let reloadAfterControllerChange = false

export type PwaUpdateDetail = {
  source: "frontend" | "service-worker"
  applyUpdate: () => void
}

export const PWA_UPDATE_EVENT = "fatboy:pwa-update-available"

function removeManagedTags() {
  document.querySelectorAll("[data-pwa-managed='true']").forEach((element) => element.remove())
}

function appendLink(rel: string, href: string, extra: Record<string, string> = {}) {
  const link = document.createElement("link")
  link.rel = rel
  link.href = href
  link.dataset.pwaManaged = "true"
  Object.entries(extra).forEach(([key, value]) => link.setAttribute(key, value))
  document.head.appendChild(link)
}

function appendMeta(name: string, content: string) {
  const meta = document.createElement("meta")
  meta.name = name
  meta.content = content
  meta.dataset.pwaManaged = "true"
  document.head.appendChild(meta)
}

function getCurrentAssetPaths() {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]")).map((script) => script.src)
  const styles = Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel='stylesheet'][href]")).map((link) => link.href)

  return [...scripts, ...styles]
    .map((assetUrl) => new URL(assetUrl, window.location.origin).pathname)
    .filter((pathname) => pathname.startsWith("/assets/"))
    .sort()
}

function getAssetPathsFromHtml(html: string) {
  const documentSnapshot = new DOMParser().parseFromString(html, "text/html")
  const scripts = Array.from(documentSnapshot.querySelectorAll<HTMLScriptElement>("script[src]")).map((script) => script.src)
  const styles = Array.from(documentSnapshot.querySelectorAll<HTMLLinkElement>("link[rel='stylesheet'][href]")).map((link) => link.href)

  return [...scripts, ...styles]
    .map((assetUrl) => new URL(assetUrl, window.location.origin).pathname)
    .filter((pathname) => pathname.startsWith("/assets/"))
    .sort()
}

function notifyPwaUpdate(source: PwaUpdateDetail["source"], registration?: ServiceWorkerRegistration) {
  if (updateAlreadyNotified) return

  updateAlreadyNotified = true
  const applyUpdate = () => {
    if (registration?.waiting) {
      reloadAfterControllerChange = true
      registration.waiting.postMessage({ type: "SKIP_WAITING" })
      window.setTimeout(() => window.location.reload(), 800)
      return
    }

    window.location.reload()
  }

  window.dispatchEvent(new CustomEvent<PwaUpdateDetail>(PWA_UPDATE_EVENT, { detail: { source, applyUpdate } }))
}

async function checkForFrontendUpdate(registration?: ServiceWorkerRegistration) {
  const currentAssets = getCurrentAssetPaths()
  if (currentAssets.length === 0) return

  const response = await fetch(`/?pwa-version-check=${Date.now()}`, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Cache-Control": "no-cache" }
  })

  if (!response.ok) return

  const remoteAssets = getAssetPathsFromHtml(await response.text())
  if (remoteAssets.length === 0) return

  const currentSignature = currentAssets.join("|")
  const remoteSignature = remoteAssets.join("|")

  if (currentSignature !== remoteSignature) {
    notifyPwaUpdate("frontend", registration)
  }
}

function watchForFrontendUpdates(registration: ServiceWorkerRegistration) {
  if (versionWatchStarted) return
  versionWatchStarted = true

  const runCheck = () => {
    void checkForFrontendUpdate(registration).catch(() => {})
    void registration.update().catch(() => {})
  }

  runCheck()
  window.setInterval(runCheck, 5 * 60 * 1000)
  window.addEventListener("focus", runCheck)
  window.addEventListener("online", runCheck)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") runCheck()
  })
}

function watchForServiceWorkerUpdates(registration: ServiceWorkerRegistration) {
  registration.addEventListener("updatefound", () => {
    const installingWorker = registration.installing
    if (!installingWorker) return

    installingWorker.addEventListener("statechange", () => {
      if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
        notifyPwaUpdate("service-worker", registration)
      }
    })
  })
}

function registerServiceWorker(script: string, scope: string) {
  if (!("serviceWorker" in navigator)) return
  if (!window.isSecureContext) return

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!reloadAfterControllerChange) return
    reloadAfterControllerChange = false
    window.location.reload()
  })

  navigator.serviceWorker
    .register(script, { scope, updateViaCache: "none" })
    .then((registration) => {
      watchForServiceWorkerUpdates(registration)
      watchForFrontendUpdates(registration)
    })
    .catch(() => {})
}

export function syncEmployeePwa(enabled: boolean) {
  if (!enabled) return

  removeManagedTags()
  appendLink("manifest", "/pwa/employee-manifest.webmanifest")
  appendLink("apple-touch-icon", "/pwa/employee-apple-touch-180.png", { sizes: "180x180" })
  appendMeta("theme-color", "#050710")
  appendMeta("apple-mobile-web-app-capable", "yes")
  appendMeta("apple-mobile-web-app-title", "Fatboy")
  appendMeta("apple-mobile-web-app-status-bar-style", "black-translucent")
  
  if (!employeeServiceWorkerRegistered) {
    registerServiceWorker("/employee-sw.js", "/employee")
    employeeServiceWorkerRegistered = true
  }
}

export function syncAdminPwa(enabled: boolean) {
  if (!enabled) return

  removeManagedTags()
  appendLink("manifest", "/pwa/admin-manifest.webmanifest")
  appendLink("apple-touch-icon", "/pwa/employee-apple-touch-180.png", { sizes: "180x180" })
  appendMeta("theme-color", "#050710")
  appendMeta("apple-mobile-web-app-capable", "yes")
  appendMeta("apple-mobile-web-app-title", "Fatboy RH")
  appendMeta("apple-mobile-web-app-status-bar-style", "black-translucent")
  
  if (!adminServiceWorkerRegistered) {
    registerServiceWorker("/admin-sw.js", "/admin")
    adminServiceWorkerRegistered = true
  }
}

export function clearPwa() {
  removeManagedTags()
}
