let employeeServiceWorkerRegistered = false

function removeManagedTags() {
  document.querySelectorAll("[data-employee-pwa='true']").forEach((element) => element.remove())
}

function appendLink(rel: string, href: string, extra: Record<string, string> = {}) {
  const link = document.createElement("link")
  link.rel = rel
  link.href = href
  link.dataset.employeePwa = "true"
  Object.entries(extra).forEach(([key, value]) => link.setAttribute(key, value))
  document.head.appendChild(link)
}

function appendMeta(name: string, content: string) {
  const meta = document.createElement("meta")
  meta.name = name
  meta.content = content
  meta.dataset.employeePwa = "true"
  document.head.appendChild(meta)
}

function registerEmployeeServiceWorker() {
  if (employeeServiceWorkerRegistered || !("serviceWorker" in navigator)) return
  if (!window.isSecureContext) return

  employeeServiceWorkerRegistered = true
  navigator.serviceWorker.register("/employee-sw.js", { scope: "/employee" }).catch(() => {
    employeeServiceWorkerRegistered = false
  })
}

export function syncEmployeePwa(enabled: boolean) {
  removeManagedTags()
  if (!enabled) return

  appendLink("manifest", "/pwa/employee-manifest.webmanifest")
  appendLink("apple-touch-icon", "/pwa/employee-apple-touch-180.png", { sizes: "180x180" })
  appendMeta("theme-color", "#f97316")
  appendMeta("apple-mobile-web-app-capable", "yes")
  appendMeta("apple-mobile-web-app-title", "Fatboy")
  appendMeta("apple-mobile-web-app-status-bar-style", "black-translucent")
  registerEmployeeServiceWorker()
}
