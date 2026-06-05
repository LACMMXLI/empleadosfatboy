let employeeServiceWorkerRegistered = false
let adminServiceWorkerRegistered = false

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

function registerServiceWorker(script: string, scope: string) {
  if (!("serviceWorker" in navigator)) return
  if (!window.isSecureContext) return
  navigator.serviceWorker.register(script, { scope }).catch(() => {})
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
  appendMeta("apple-mobile-web-app-title", "Fatboy Admin")
  appendMeta("apple-mobile-web-app-status-bar-style", "black-translucent")
  
  if (!adminServiceWorkerRegistered) {
    registerServiceWorker("/admin-sw.js", "/admin")
    adminServiceWorkerRegistered = true
  }
}

export function clearPwa() {
  removeManagedTags()
}
