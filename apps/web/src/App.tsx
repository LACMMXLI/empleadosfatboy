import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { CheckCircle2, X } from "lucide-react"
import { api, employeeSession, session } from "@/lib/api"
import { clearPwa, PWA_UPDATE_EVENT, syncAdminPwa, syncEmployeePwa, syncTimeClockPwa, type PwaUpdateDetail } from "@/pwa/employeePwa"
import { AdminLogin, EmployeeLogin, PortalSelector } from "@/features/auth/PortalAuth"
import { Shell } from "@/features/admin/AdminShell"
import { EmployeePortal } from "@/features/employee/EmployeePortal"
import { TimeClockKiosk } from "@/features/time-clock/TimeClockKiosk"
import type { PortalRoute, View } from "@/lib/ledger-ui"

function usePwaUpdateNotification() {
  const [update, setUpdate] = useState<PwaUpdateDetail | null>(null)

  useEffect(() => {
    const onUpdateAvailable = (event: Event) => {
      setUpdate((event as CustomEvent<PwaUpdateDetail>).detail)
    }

    window.addEventListener(PWA_UPDATE_EVENT, onUpdateAvailable)
    return () => window.removeEventListener(PWA_UPDATE_EVENT, onUpdateAvailable)
  }, [])

  return { update, dismissUpdate: () => setUpdate(null) }
}

function PwaUpdateNotice({
  update,
  onDismiss
}: {
  update: PwaUpdateDetail | null
  onDismiss: () => void
}) {
  if (!update) return null

  return (
    <div 
      role="alert" 
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-sm rounded-xl border border-cyan-500/30 bg-slate-900/95 p-4 text-sm shadow-2xl shadow-cyan-900/20 backdrop-blur-md transition-all duration-300 ease-out sm:bottom-6"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-cyan-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-100">Nueva versión disponible</p>
          <p className="mt-1 text-xs text-slate-300">Actualiza para cargar los cambios recientes del sistema.</p>
          <div className="mt-4 flex gap-3">
            <button
              className="flex-1 h-9 rounded-lg bg-cyan-500 px-3 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              onClick={update.applyUpdate}
              type="button"
            >
              Actualizar
            </button>
            <button
              className="flex-1 h-9 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              onClick={onDismiss}
              type="button"
            >
              Más tarde
            </button>
          </div>
        </div>
        <button 
          className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400" 
          onClick={onDismiss} 
          type="button"
          aria-label="Cerrar notificación"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function App() {
  const [tokenState, setTokenState] = useState(session.token)
  const [employeeTokenState, setEmployeeTokenState] = useState(employeeSession.token)
  const [activeView, setActiveView] = useState<View>("pendientes")
  const [route, setRoute] = useState<PortalRoute>(resolvePortalRoute())
  const { update, dismissUpdate } = usePwaUpdateNotification()

  const me = useQuery({ queryKey: ["me"], queryFn: api.me, enabled: !!tokenState && route === "admin" })

  useEffect(() => {
    const onPopState = () => setRoute(resolvePortalRoute())
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  useEffect(() => {
    if (route === "employee") {
      syncEmployeePwa(true)
    } else if (route === "admin") {
      syncAdminPwa(true)
    } else if (route === "timeClock") {
      syncTimeClockPwa(true)
    } else {
      clearPwa()
    }
  }, [route])

  useEffect(() => {
    if (me.data?.role === "CAJERO" && activeView !== "entregas") {
      setActiveView("entregas")
    } else if (me.data && me.data.role !== "CAJERO" && activeView === "entregas") {
      setActiveView("pendientes")
    }
  }, [me.data, activeView])

  let content

  if (route === "employee" && employeeTokenState) {
    content = <EmployeePortal onLogout={() => setEmployeeTokenState(null)} />
  } else if (route === "employee") {
    content = <EmployeeLogin onLoggedIn={(token) => setEmployeeTokenState(token)} />
  } else if (route === "admin" && tokenState) {
    content = <Shell activeView={activeView} onViewChange={setActiveView} onLogout={() => setTokenState(null)} />
  } else if (route === "admin") {
    content = <AdminLogin onLoggedIn={(token) => setTokenState(token)} />
  } else if (route === "timeClock") {
    content = <TimeClockKiosk />
  } else {
    content = <PortalSelector onNavigate={setRoute} />
  }

  return (
    <>
      {content}
      <PwaUpdateNotice update={update} onDismiss={dismissUpdate} />
    </>
  )
}

function resolvePortalRoute(): PortalRoute {
  const path = window.location.pathname.toLowerCase()
  if (path.startsWith("/checador")) return "timeClock"
  if (path.startsWith("/employee")) return "employee"
  if (path.startsWith("/admin")) return "admin"
  return "home"
}

export default App
