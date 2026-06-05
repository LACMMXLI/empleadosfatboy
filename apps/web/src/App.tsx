import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Banknote,
  Building2,
  CheckCircle2,
  ClipboardList,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  WalletCards,
  UserRound,
  UserRoundPlus,
  UsersRound,
  X,
  Phone,
  Download
} from "lucide-react"
import { api, employeeSession, session } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import type { Branch, Employee, Movement, MovementKind, MovementSettlementTicket, MovementStatus, Payroll, PayrollItem, Role, SalaryType, User } from "@/types/domain"
import { clearPwa, syncAdminPwa, syncEmployeePwa } from "@/pwa/employeePwa"
import fatboyLogo from "@/assets/logo.png"

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" })

const movementLabels: Record<MovementKind, string> = {
  SALARY_ADVANCE: "Adelanto",
  LOAN: "Prestamo",
  INTERNAL_CONSUMPTION: "Consumo interno",
  DRINK: "Bebida",
  FOOD: "Comida",
  CASH_OUT: "Salida efectivo",
  ADMIN_ADJUSTMENT: "Descuento administrativo",
  ADMIN_CHARGE: "Ajuste manual",
  SHORTAGE_DISCOUNT: "Cargo por faltante",
  DAMAGE_DISCOUNT: "Penalización",
  BALANCE_CORRECTION: "Corrección autorizada",
  ADMIN_SALARY_ADVANCE: "Adelanto admin",
  ADMIN_LOAN: "Préstamo admin"
}

const statusLabels: Record<MovementStatus, string> = {
  PENDING: "Pendiente",
  AUTHORIZED: "Autorizado",
  REJECTED: "Rechazado",
  CANCELED: "Cancelado",
  DISCOUNTED: "Descontado",
  PARTIALLY_DISCOUNTED: "Parcial"
}

const salaryTypeLabels: Record<SalaryType, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal",
  DAILY: "Diario"
}

const payrollStatusLabels: Record<string, string> = {
  BORRADOR: "Borrador",
  GENERADA: "Generada",
  PAGADA: "Pagada",
  CANCELADA: "Cancelada"
}

const viewTitles: Record<View, string> = {
  dashboard: "Dashboard",
  empleados: "Empleados",
  pendientes: "Aprobaciones",
  adminMovements: "Movimientos",
  historial: "Historial",
  nomina: "Nómina",
  configuracion: "Configuración",
  entregas: "Entregas"
}

function getStatusBadgeClass(status: MovementStatus): string {
  switch (status) {
    case "PENDING": return "badge-status badge-pending"
    case "AUTHORIZED": return "badge-status badge-authorized"
    case "REJECTED": return "badge-status badge-rejected"
    case "CANCELED": return "badge-status badge-canceled"
    case "DISCOUNTED": return "badge-status badge-discounted"
    case "PARTIALLY_DISCOUNTED": return "badge-status badge-partial"
    default: return "badge-status badge-canceled"
  }
}

function getPayrollBadgeClass(status: string): string {
  switch (status) {
    case "BORRADOR": return "badge-payroll-draft"
    case "GENERADA": return "badge-payroll-generated"
    case "PAGADA": return "badge-payroll-paid"
    case "CANCELADA": return "badge-payroll-canceled"
    default: return "badge-payroll-draft"
  }
}

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()
}

const adminMovementSchema = z.object({
  employeeId: z.string().min(1, "Selecciona empleado"),
  kind: z.enum([
    "ADMIN_ADJUSTMENT",
    "ADMIN_CHARGE",
    "INTERNAL_CONSUMPTION",
    "SHORTAGE_DISCOUNT",
    "DAMAGE_DISCOUNT",
    "BALANCE_CORRECTION"
  ]),
  amount: z.coerce.number().positive("Cantidad invalida"),
  reason: z.string().min(3, "Motivo requerido"),
  evidenceNote: z.string().optional()
})
type AdminMovementFormInput = z.input<typeof adminMovementSchema>
type AdminMovementFormOutput = z.output<typeof adminMovementSchema>

const employeeRequestSchema = z.object({
  kind: z.enum(["SALARY_ADVANCE", "DRINK", "INTERNAL_CONSUMPTION"]),
  amount: z.preprocess((value) => {
    if (value === "" || value === null || typeof value === "undefined") return 0
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }, z.number().positive("El monto debe ser mayor a $0")),
  reason: z.string().optional(),
  productName: z.string().optional(),
  quantity: z.coerce.number().optional(),
  unitPrice: z.coerce.number().optional()
}).superRefine((data, ctx) => {
  if (data.kind !== "DRINK" && (!data.reason || data.reason.trim().length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Agrega un motivo para continuar",
      path: ["reason"]
    })
  }
})
type EmployeeRequestFormInput = z.input<typeof employeeRequestSchema>
type EmployeeRequestFormOutput = z.output<typeof employeeRequestSchema>

const employeeSchema = z.object({
  fullName: z.string().min(3),
  pin: z.string().length(6),
  position: z.string().min(2),
  phone: z.string().min(10, "Teléfono a 10 dígitos requerido"),
  salaryAmount: z.coerce.number().min(0),
  salaryType: z.enum(["WEEKLY", "BIWEEKLY", "DAILY"]),
  hireDate: z.string().optional(),
  branchId: z.string().min(1, "Selecciona una sucursal")
})
type EmployeeFormInput = z.input<typeof employeeSchema>
type EmployeeFormOutput = z.output<typeof employeeSchema>

const employeeEditSchema = z.object({
  fullName: z.string().min(3),
  pin: z.string().optional().refine((value) => !value || value.length === 6, "PIN a 6 dígitos"),
  position: z.string().min(2),
  phone: z.string().min(10, "Teléfono a 10 dígitos requerido"),
  salaryAmount: z.coerce.number().min(0),
  salaryType: z.enum(["WEEKLY", "BIWEEKLY", "DAILY"]),
  hireDate: z.string().optional(),
  branchId: z.string().min(1, "Selecciona una sucursal")
})
type EmployeeEditFormInput = z.input<typeof employeeEditSchema>
type EmployeeEditFormOutput = z.output<typeof employeeEditSchema>

const ruleSchema = z.object({
  kind: z.string().optional(),
  minAmount: z.coerce.number().min(0),
  maxAmount: z.coerce.number().optional(),
  requiredRole: z.enum(["ADMINISTRADOR", "GERENTE", "ENCARGADO", "CAJERO", "EMPLEADO"])
})
type RuleFormInput = z.input<typeof ruleSchema>
type RuleFormOutput = z.output<typeof ruleSchema>

const configSchema = z.object({
  beveragePrice: z.coerce.number().positive("Precio invalido")
})
type ConfigFormInput = z.input<typeof configSchema>
type ConfigFormOutput = z.output<typeof configSchema>

const adminUserSchema = z.object({
  fullName: z.string().min(3, "Nombre requerido"),
  email: z.string().email("Correo invalido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  role: z.enum(["ADMINISTRADOR", "GERENTE", "ENCARGADO", "CAJERO"]),
  branchId: z.string().optional()
})
type AdminUserFormInput = z.input<typeof adminUserSchema>
type AdminUserFormOutput = z.output<typeof adminUserSchema>

const adminUserEditSchema = z.object({
  fullName: z.string().min(3, "Nombre requerido"),
  email: z.string().email("Correo invalido"),
  password: z.string().optional().refine((value) => !value || value.length >= 8, "Mínimo 8 caracteres"),
  role: z.enum(["ADMINISTRADOR", "GERENTE", "ENCARGADO", "CAJERO"]),
  branchId: z.string().optional()
})
type AdminUserEditFormInput = z.input<typeof adminUserEditSchema>
type AdminUserEditFormOutput = z.output<typeof adminUserEditSchema>

type View = "dashboard" | "empleados" | "pendientes" | "adminMovements" | "historial" | "nomina" | "configuracion" | "entregas"
type PortalRoute = "home" | "admin" | "employee"

const employeeRequestKinds: MovementKind[] = ["SALARY_ADVANCE", "DRINK", "INTERNAL_CONSUMPTION"]
const quickRequestReasons = ["Emergencia", "Transporte", "Familiar", "Médico", "Otro"]
const administrativeMovementKinds: MovementKind[] = [
  "ADMIN_ADJUSTMENT",
  "SHORTAGE_DISCOUNT",
  "INTERNAL_CONSUMPTION",
  "ADMIN_CHARGE",
  "DAMAGE_DISCOUNT",
  "BALANCE_CORRECTION"
]

function LoginLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`login-logo relative mx-auto w-full ${className}`}>
      <img className="relative z-10 h-28 w-full object-contain" src={fatboyLogo} alt="Fatboy" />
    </div>
  )
}

function LoginFrame({ children, variant }: { children: ReactNode; variant: "admin" | "employee" }) {
  return (
    <main className={`login-scene login-scene-${variant}`}>
      <div className="login-grid" />
      <div className="relative z-10 flex min-h-screen w-full items-center justify-center p-4">{children}</div>
    </main>
  )
}

function useScrollDirection() {
  const [scrollDir, setScrollDir] = useState<"up" | "down">("up")
  const [isNearTop, setIsNearTop] = useState(true)

  useEffect(() => {
    let lastScrollY = window.scrollY
    let ticking = false

    const updateScrollDirection = () => {
      const scrollY = window.scrollY
      setIsNearTop(scrollY < 15)

      if (Math.abs(scrollY - lastScrollY) < 5) {
        ticking = false
        return
      }

      if (scrollY > lastScrollY) {
        setScrollDir("down")
      } else {
        setScrollDir("up")
      }
      lastScrollY = scrollY > 0 ? scrollY : 0
      ticking = false
    }

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollDirection)
        ticking = true
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return { scrollDir, isNearTop }
}

function usePWAInstall() {
  const [promptEvent, setPromptEvent] = useState<any>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setPromptEvent(e)
    }

    const handleAppInstalled = () => {
      setPromptEvent(null)
      setIsInstalled(true)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)

    // Check display mode
    if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone) {
      setIsInstalled(true)
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])

  const install = async () => {
    if (promptEvent) {
      promptEvent.prompt()
      const { outcome } = await promptEvent.userChoice
      if (outcome === "accepted") {
        setPromptEvent(null)
      }
    } else {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      if (isIOS) {
        setShowIOSInstructions(true)
      } else {
        alert("Para instalar esta aplicación, haz clic en el icono de instalación (pantalla con flecha hacia abajo) en la barra de direcciones de tu navegador (Chrome/Edge).")
      }
    }
  }

  return {
    isInstallable: !!promptEvent,
    isInstalled,
    install,
    showIOSInstructions,
    setShowIOSInstructions
  }
}

function App() {
  const [tokenState, setTokenState] = useState(session.token)
  const [employeeTokenState, setEmployeeTokenState] = useState(employeeSession.token)
  const [activeView, setActiveView] = useState<View>("pendientes")
  const [route, setRoute] = useState<PortalRoute>(resolvePortalRoute())

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

  if (route === "employee" && employeeTokenState) {
    return <EmployeePortal onLogout={() => setEmployeeTokenState(null)} />
  }

  if (route === "employee") {
    return <EmployeeLogin onLoggedIn={(token) => setEmployeeTokenState(token)} />
  }

  if (route === "admin" && tokenState) {
    return <Shell activeView={activeView} onViewChange={setActiveView} onLogout={() => setTokenState(null)} />
  }

  if (route === "admin") {
    return <AdminLogin onLoggedIn={(token) => setTokenState(token)} />
  }

  return <PortalSelector onNavigate={setRoute} />
}

function resolvePortalRoute(): PortalRoute {
  const path = window.location.pathname.toLowerCase()
  if (path.startsWith("/employee")) return "employee"
  if (path.startsWith("/admin")) return "admin"
  return "home"
}

function goToPortal(route: PortalRoute, onNavigate: (route: PortalRoute) => void) {
  const path = route === "home" ? "/" : `/${route}`
  window.history.pushState(null, "", path)
  onNavigate(route)
}

function PortalSelector({ onNavigate }: { onNavigate: (route: PortalRoute) => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-3xl space-y-4">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Fatboy Control Empleados</h1>
          <p className="text-sm text-muted-foreground">Selecciona el portal que quieres abrir</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UsersRound className="h-4 w-4" />
                Portal del Empleado
              </CardTitle>
              <p className="text-sm text-muted-foreground">Solicitudes, saldo e historial personal.</p>
            </CardHeader>
            <CardContent>
              <Button className="h-12 w-full" onClick={() => goToPortal("employee", onNavigate)}>
                Abrir empleado
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4" />
                Portal Administrativo
              </CardTitle>
              <p className="text-sm text-muted-foreground">Autorizaciones, empleados y movimientos administrativos.</p>
            </CardHeader>
            <CardContent>
              <Button className="h-12 w-full" onClick={() => goToPortal("admin", onNavigate)}>
                Abrir administración
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}

function AdminLogin({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm({ defaultValues: { email: "", password: "" } })
  const login = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => api.login(email, password),
    onSuccess: (data) => {
      session.token = data.token
      employeeSession.token = null
      onLoggedIn(data.token)
    },
    onError: (err: Error) => setError(err.message)
  })

  const { isInstalled, install, showIOSInstructions, setShowIOSInstructions } = usePWAInstall()

  return (
    <LoginFrame variant="admin">
      <Card className="login-card w-full max-w-sm">
        <CardHeader className="space-y-4 p-5 pb-3">
          <LoginLogo />
          <div>
            <CardTitle className="text-xl">Portal Administrativo</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Correo electrónico y contraseña</p>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-2">
          <form className="space-y-3" onSubmit={form.handleSubmit((values) => login.mutate(values))}>
            <Input className="login-input h-12" placeholder="Email" {...form.register("email")} />
            <Input className="login-input h-12" placeholder="Password" type="password" {...form.register("password")} />
            {error && <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm">{error}</div>}
            <Button className="login-primary h-12 w-full text-base font-semibold" disabled={login.isPending} type="submit">
              Entrar a administración
            </Button>
            
            {!isInstalled && (
              <Button 
                className="w-full h-11 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center gap-2 mt-2 transition-all font-semibold"
                onClick={install}
                type="button"
              >
                <Download className="h-4 w-4" />
                Instalar App Administrativa
              </Button>
            )}

            {showIOSInstructions && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 text-xs text-cyan-300 mt-2 space-y-1 text-left">
                <p className="font-semibold">Instrucciones para iOS:</p>
                <ol className="list-decimal pl-4 space-y-0.5">
                  <li>Pulsa el botón <strong>Compartir</strong> en Safari (abajo en el centro).</li>
                  <li>Selecciona <strong>Agregar a inicio</strong> en la lista de opciones.</li>
                </ol>
                <button className="text-cyan-400 font-bold block pt-1 hover:underline text-left" onClick={() => setShowIOSInstructions(false)} type="button">
                  Entendido, cerrar
                </button>
              </div>
            )}

            <Button className="h-11 w-full rounded-xl hover:bg-white/10" type="button" variant="ghost" onClick={() => goToPortal("home", () => window.location.reload())}>
              Volver
            </Button>
          </form>
        </CardContent>
      </Card>
    </LoginFrame>
  )
}

function EmployeeLogin({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const [employeeError, setEmployeeError] = useState<string | null>(null)
  const employeeForm = useForm({ defaultValues: { phone: "", pin: "" } })
  const employeeLogin = useMutation({
    mutationFn: ({ phone, pin }: { phone: string; pin: string }) => api.employeePortal.login(phone, pin),
    onSuccess: (data) => {
      employeeSession.token = data.token
      session.token = null
      onLoggedIn(data.token)
    },
    onError: (err: Error) => setEmployeeError(err.message)
  })

  const { isInstalled, install, showIOSInstructions, setShowIOSInstructions } = usePWAInstall()

  return (
    <LoginFrame variant="employee">
      <Card className="login-card w-full max-w-sm text-[#f7efe3]">
        <CardHeader className="space-y-4 p-5 pb-3">
          <LoginLogo />
          <div>
            <CardTitle className="text-xl text-center">Portal Empleado</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground text-center">Ingresa con tu teléfono y código PIN</p>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-2">
          <form className="space-y-4" onSubmit={employeeForm.handleSubmit((values) => employeeLogin.mutate(values))}>
            <div className="relative">
              <Phone className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" style={{ color: 'hsl(var(--primary))' }} />
              <input className="form-input login-input h-12 pl-12" placeholder="Teléfono" inputMode="tel" {...employeeForm.register("phone")} />
            </div>
            <div className="relative">
              <KeyRound className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" style={{ color: 'hsl(var(--accent))' }} />
              <input className="form-input login-input h-12 pl-12" placeholder="PIN de 6 dígitos" type="password" inputMode="numeric" maxLength={6} {...employeeForm.register("pin")} />
            </div>
            {employeeError && <div className="rounded-2xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-center">{employeeError}</div>}
            <button className="login-primary h-12 w-full text-base font-semibold" disabled={employeeLogin.isPending} type="submit">
              {employeeLogin.isPending ? "Ingresando..." : "Ingresar"}
            </button>

            {!isInstalled && (
              <button
                className="w-full mt-2 bg-[#f97316]/10 hover:bg-[#f97316]/20 text-[#f97316] border border-[#f97316]/30 rounded-2xl h-12 flex items-center justify-center gap-2 font-semibold transition-all"
                onClick={install}
                type="button"
              >
                <Download className="h-4 w-4" />
                Instalar App Empleado
              </button>
            )}

            {showIOSInstructions && (
              <div className="rounded-2xl border border-[#f97316]/30 bg-[#f97316]/5 p-3 text-xs text-[#f97316] mt-2 space-y-1 text-left">
                <p className="font-semibold">Instrucciones para iOS:</p>
                <ol className="list-decimal pl-4 space-y-0.5">
                  <li>Pulsa el botón <strong>Compartir</strong> en Safari (abajo en el centro).</li>
                  <li>Selecciona <strong>Agregar a inicio</strong> en la lista de opciones.</li>
                </ol>
                <button className="text-[#f97316] font-bold block pt-1 hover:underline text-left" onClick={() => setShowIOSInstructions(false)} type="button">
                  Entendido, cerrar
                </button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </LoginFrame>
  )
}

function Shell({
  activeView,
  onViewChange,
  onLogout
}: {
  activeView: View
  onViewChange: (view: View) => void
  onLogout: () => void
}) {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me })
  const { scrollDir, isNearTop } = useScrollDirection()
  const showNav = isNearTop || scrollDir === "up"

  const views = useMemo(() => {
    if (me.data?.role === "CAJERO") {
      return [
        { id: "entregas" as const, label: "Entregas", icon: CheckCircle2 }
      ]
    }
    return [
      { id: "pendientes" as const, label: "Aprobaciones", icon: ShieldCheck },
      { id: "historial" as const, label: "Historial", icon: ClipboardList },
      { id: "empleados" as const, label: "Empleados", icon: UsersRound },
      { id: "nomina" as const, label: "Nómina", icon: WalletCards },
      { id: "adminMovements" as const, label: "Movimientos", icon: Building2 },
      { id: "dashboard" as const, label: "Resumen", icon: LayoutDashboard },
      { id: "configuracion" as const, label: "Config", icon: Settings }
    ]
  }, [me.data?.role])

  return (
    <main className="admin-shell min-h-screen">
      <div className="flex min-h-screen">
        {/* === Desktop Sidebar === */}
        <aside className="admin-sidebar hidden w-60 flex-col lg:flex" style={{ position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
          <div className="admin-sidebar-brand">
            <img src={fatboyLogo} alt="Fatboy" className="admin-sidebar-logo" />
            <div>
              <div className="admin-sidebar-title">Fatboy POS</div>
              <div className="admin-sidebar-subtitle">Admin</div>
            </div>
          </div>
          <nav className="flex flex-col gap-0.5 p-2 flex-1">
            {views.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${activeView === item.id ? "active" : ""}`}
                onClick={() => onViewChange(item.id)}
                type="button"
              >
                <item.icon className="nav-icon" />
                {item.id === "pendientes" ? "Aprobaciones" : (item.id === "entregas" ? "Entregas" : viewTitles[item.id])}
              </button>
            ))}
          </nav>
          <div className="p-2 border-t border-white/5">
            <button
              className="nav-item w-full"
              onClick={() => { session.token = null; onLogout() }}
              type="button"
            >
              <LogOut className="nav-icon" />
              Cerrar sesión
            </button>
          </div>
        </aside>

        {/* === Main Content === */}
        <section className="flex min-w-0 flex-1 flex-col">
          <header 
            className="admin-header"
            style={{ transform: showNav ? "translateY(0)" : "translateY(-100%)" }}
          >
            <div className="flex items-center gap-3">
              <div className="lg:hidden">
                <img src={fatboyLogo} alt="" className="h-6 w-auto opacity-80" />
              </div>
              <div className="admin-header-user">
                <div className="admin-header-view lg:hidden">{viewTitles[activeView]}</div>
                <div className="admin-header-name">
                  {me.data?.fullName ?? "Usuario"}{" "}
                  {me.data?.branch?.name ? `(${me.data.branch.name})` : ""}{" "}
                  <span style={{ opacity: 0.4 }} className="mx-1">/</span>{" "}
                  <span className="admin-header-role-inline">{me.data?.role ?? ""}</span>
                </div>
              </div>
            </div>
            <button
              className="btn-icon lg:hidden"
              onClick={() => { session.token = null; onLogout() }}
              type="button"
              aria-label="Cerrar sesión"
            >
              <LogOut style={{ width: 16, height: 16 }} />
            </button>
          </header>
          <div className="mobile-page flex-1 p-3 lg:p-5">
            {activeView === "dashboard" && <Dashboard />}
            {activeView === "empleados" && <Employees user={me.data} />}
            {activeView === "pendientes" && <PendingAuthorizations currentRole={me.data?.role} />}
            {activeView === "adminMovements" && <AdministrativeMovements user={me.data} />}
            {activeView === "historial" && <History />}
            {activeView === "nomina" && <PayrollAdmin />}
            {activeView === "configuracion" && <Configuration />}
            {activeView === "entregas" && <Deliveries />}
          </div>
        </section>
      </div>

      {/* === Mobile Bottom Nav === */}
      <MobileBottomNav 
        activeView={activeView} 
        views={views} 
        onViewChange={onViewChange} 
        style={{ transform: showNav ? "translateY(0)" : "translateY(100%)" }}
      />
    </main>
  )
}

function MobileBottomNav({
  activeView,
  views,
  onViewChange,
  style
}: {
  activeView: View
  views: Array<{ id: View; label: string; icon: typeof LayoutDashboard }>
  onViewChange: (view: View) => void
  style?: React.CSSProperties
}) {
  const navLabels: Record<View, string> = {
    pendientes: "Aprobar",
    historial: "Historial",
    empleados: "Empleados",
    nomina: "Nómina",
    adminMovements: "Movim.",
    dashboard: "Resumen",
    configuracion: "Config",
    entregas: "Entregas"
  }
  return (
    <nav className="bottom-nav lg:hidden" style={style}>
      <div className="grid gap-0.5 max-w-lg mx-auto" style={{ gridTemplateColumns: `repeat(${views.length}, minmax(0, 1fr))` }}>
        {views.map((item) => {
          const active = activeView === item.id
          return (
            <button
              key={item.id}
              className={`bottom-nav-item ${active ? "active" : ""}`}
              onClick={() => onViewChange(item.id)}
              type="button"
            >
              <item.icon className="bottom-nav-icon" />
              <span style={{ fontSize: '0.5rem', letterSpacing: '0.02em', fontWeight: 600 }}>{navLabels[item.id]}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function Dashboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard })
  const periodStart = useMemo(() => startOfCurrentMonth(), [])
  const periodMovements = useQuery({
    queryKey: ["movements", "dashboard-period", periodStart],
    queryFn: () => api.movements({ from: periodStart })
  })
  if (isLoading) return <StatusEmpty text="Cargando resumen..." />
  if (error) return <StatusEmpty text={(error as Error).message} />
  if (!data) return null

  const movements = periodMovements.data ?? []
  const pendingRequests = movements.filter((m) => m.origin === "EMPLOYEE_REQUEST" && m.status === "PENDING").length
  const authorizedAdvances = movements
    .filter((m) => m.kind === "SALARY_ADVANCE" && m.status === "AUTHORIZED")
    .reduce((t, m) => t + Number(m.amount), 0)
  const administrativeMovements = movements.filter((m) => m.origin === "ADMINISTRATIVE_ACTION").length

  return (
    <div className="space-y-4">
      <div>
        <div className="section-title mb-4">
          <LayoutDashboard style={{ width: 16, height: 16, color: '#00e5ff' }} />
          Resumen del periodo
        </div>
        <div className="grid metric-grid gap-3">
          <div className="stat-card stat-card-amber">
            <ShieldCheck className="stat-icon" style={{ color: '#f59e0b' }} />
            <div className="stat-label">Pendientes</div>
            <div className="stat-value stat-value-amber">
              {periodMovements.data ? pendingRequests : data.cards.pendingMovements}
            </div>
          </div>
          <div className="stat-card stat-card-cyan">
            <Banknote className="stat-icon" style={{ color: '#00e5ff' }} />
            <div className="stat-label">Adelantos autorizados</div>
            <div className="stat-value stat-value-cyan" style={{ fontSize: '1.35rem' }}>
              {money.format(authorizedAdvances)}
            </div>
          </div>
          <div className="stat-card stat-card-violet">
            <Building2 className="stat-icon" style={{ color: '#a855f7' }} />
            <div className="stat-label">Movim. administrativos</div>
            <div className="stat-value stat-value-violet">{administrativeMovements}</div>
          </div>
          <div className="stat-card stat-card-green">
            <WalletCards className="stat-icon" style={{ color: '#22c55e' }} />
            <div className="stat-label">Por descontar</div>
            <div className="stat-value stat-value-green" style={{ fontSize: '1.35rem' }}>
              {money.format(data.cards.pendingToDiscount)}
            </div>
          </div>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">Detalle del periodo</div>
          <span style={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))' }}>
            Desde {formatDateLabel(periodStart)}
          </span>
        </div>
        <div className="admin-card-body">
          <div className="grid gap-2 md:grid-cols-3">
            <div style={{ padding: '0.75rem', borderRadius: '0.625rem', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(5,7,16,0.4)' }}>
              <div className="stat-label">Solicitudes totales</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'hsl(var(--foreground))' }}>{data.cards.pendingMovements}</div>
            </div>
            <div style={{ padding: '0.75rem', borderRadius: '0.625rem', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(5,7,16,0.4)' }}>
              <div className="stat-label">Autorizados activos</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#4ade80' }}>{data.cards.authorizedMovements}</div>
            </div>
            <div style={{ padding: '0.75rem', borderRadius: '0.625rem', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(5,7,16,0.4)' }}>
              <div className="stat-label">Estado</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                {periodMovements.isLoading ? "Actualizando..." : "Al corriente"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: string }) {
  const cardClass = tone === "primary" ? "stat-card stat-card-amber"
    : tone === "accent" ? "stat-card stat-card-violet"
    : tone === "strong" ? "stat-card stat-card-green"
    : "stat-card stat-card-cyan"
  const valClass = tone === "primary" ? "stat-value stat-value-amber"
    : tone === "accent" ? "stat-value stat-value-violet"
    : tone === "strong" ? "stat-value stat-value-green"
    : "stat-value stat-value-cyan"
  return (
    <div className={cardClass}>
      <div className="stat-label">{label}</div>
      <div className={valClass} style={{ fontSize: '1.35rem' }}>{value}</div>
    </div>
  )
}

function GuidedBlock({
  step,
  title,
  detail,
  children
}: {
  step: string
  title: string
  detail: string
  children: React.ReactNode
}) {
  return (
    <section className="guided-block">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="guided-block-step">{step}</div>
        <div className="min-w-0">
          <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>{title}</div>
          <div style={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</div>
        </div>
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

function AdministrativeMovements({ user }: { user?: User }) {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const [settlementMessage, setSettlementMessage] = useState<string | null>(null)
  const [settlementEmployeeId, setSettlementEmployeeId] = useState("")
  const [settlementFrom, setSettlementFrom] = useState("")
  const [settlementTo, setSettlementTo] = useState("")
  const employees = useQuery({ queryKey: ["employees"], queryFn: () => api.employees() })
  const allowed = user?.role === "ADMINISTRADOR" || user?.role === "GERENTE"
  const selectedSettlementEmployee = employees.data?.find((employee) => employee.id === settlementEmployeeId)
  const settlementSummary = useQuery({
    queryKey: ["movement-settlement-summary", settlementEmployeeId, settlementFrom, settlementTo],
    queryFn: () =>
      api.movementSettlementSummary({
        employeeId: settlementEmployeeId,
        from: settlementFrom || undefined,
        to: settlementTo || undefined
      }),
    enabled: Boolean(settlementEmployeeId)
  })
  const form = useForm<AdminMovementFormInput, unknown, AdminMovementFormOutput>({
    resolver: zodResolver(adminMovementSchema),
    defaultValues: {
      kind: "ADMIN_ADJUSTMENT",
      amount: 0,
      reason: ""
    }
  })
  const mutation = useMutation({
    mutationFn: (payload: AdminMovementFormOutput) => api.createAdministrativeMovement(payload),
    onSuccess: async (movement) => {
      setMessage(`Movimiento administrativo ${movement.folio} registrado`)
      form.reset({ kind: "ADMIN_ADJUSTMENT", amount: 0, reason: "" })
      await queryClient.invalidateQueries()
    },
    onError: (err: Error) => setMessage(err.message)
  })
  const settle = useMutation({
    mutationFn: () =>
      api.settleMovements({
        employeeId: settlementEmployeeId,
        from: settlementFrom,
        to: settlementTo
      }),
    onSuccess: async (result) => {
      setSettlementMessage(`${result.ticketNumber ?? "Ticket"} · ${result.count} movimiento(s) liquidados por ${money.format(result.total)}`)
      await queryClient.invalidateQueries({ queryKey: ["movements"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      await queryClient.invalidateQueries({ queryKey: ["movement-settlement-summary"] })
      await queryClient.invalidateQueries({ queryKey: ["employeePortal"] })
    },
    onError: (err: Error) => setSettlementMessage(err.message)
  })
  const canSettle = Boolean(
    settlementEmployeeId &&
      settlementFrom &&
      settlementTo &&
      (settlementSummary.data?.count ?? 0) > 0 &&
      !settle.isPending
  )

  if (!allowed) {
    return <StatusText text="Esta sección solo está disponible para GERENTE o ADMINISTRADOR." />
  }

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
      <div className="admin-card min-w-0">
        <div className="admin-card-header">
          <div className="admin-card-title">
            <Building2 style={{ width: 14, height: 14, color: '#00e5ff' }} />
            Movimientos Administrativos
          </div>
        </div>
        <div className="admin-card-body">
          <form className="space-y-3" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
            <GuidedBlock step="1" title="Empleado" detail="Selecciona a quien se aplicará el movimiento">
              <select className="form-select" {...form.register("employeeId")}>
                <option value="">Seleccionar empleado</option>
                {employees.data?.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.phone} - {employee.fullName}
                  </option>
                ))}
              </select>
            </GuidedBlock>
            <GuidedBlock step="2" title="Tipo y monto" detail="Registro administrativo directo, sin PIN de empleado">
              <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: '1fr 1fr' }}>
                <select className="form-select" {...form.register("kind")}>
                  {administrativeMovementKinds.map((kind) => (
                    <option key={kind} value={kind}>{movementLabels[kind]}</option>
                  ))}
                </select>
                <input className="form-input" type="number" step="0.01" placeholder="Monto" {...form.register("amount")} />
              </div>
            </GuidedBlock>
            <GuidedBlock step="3" title="Motivo y evidencia" detail="El motivo es obligatorio para auditoría">
              <textarea className="form-textarea" placeholder="Motivo obligatorio" {...form.register("reason")} />
              <textarea className="form-textarea" placeholder="Evidencia / nota administrativa (opcional)" {...form.register("evidenceNote")} />
            </GuidedBlock>
            <GuidedBlock step="4" title="Responsable" detail="El backend registra el usuario autorizado">
              <div style={{ padding: '0.625rem', borderRadius: '0.5rem', border: '1px solid rgba(0,229,255,0.15)', background: 'rgba(0,229,255,0.04)' }}>
                <div className="stat-label">Registrado como</div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'hsl(var(--foreground))' }}>{user?.fullName ?? "Usuario administrativo"}</div>
              </div>
            </GuidedBlock>
            <button className="btn-primary" style={{ width: '100%', height: '2.75rem', fontSize: '0.9rem' }} disabled={mutation.isPending} type="submit">
              Registrar movimiento
            </button>
            {message && <div className="status-empty">{message}</div>}
          </form>
        </div>
      </div>
      <div className="admin-card min-w-0">
        <div className="admin-card-header">
          <div className="admin-card-title">
            <CheckCircle2 style={{ width: 14, height: 14, color: '#4ade80' }} />
            Liquidar por empleado
          </div>
        </div>
        <div className="admin-card-body space-y-4">
          <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
            <select
              className="form-select"
              value={settlementEmployeeId}
              onChange={(event) => { setSettlementEmployeeId(event.target.value); setSettlementMessage(null) }}
            >
              <option value="">Seleccionar empleado</option>
              {employees.data?.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.phone} - {employee.fullName}</option>
              ))}
            </select>
            <input
              className="form-input"
              type="date"
              value={settlementFrom}
              onChange={(event) => { setSettlementFrom(event.target.value); setSettlementMessage(null) }}
            />
            <input
              className="form-input"
              type="date"
              value={settlementTo}
              onChange={(event) => { setSettlementTo(event.target.value); setSettlementMessage(null) }}
            />
          </div>

          <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div style={{ padding: '0.75rem', borderRadius: '0.625rem', border: '1px solid rgba(0,229,255,0.15)', background: 'rgba(0,229,255,0.04)' }}>
              <div className="stat-label">Empleado</div>
              <div style={{ fontSize: '0.825rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'hsl(var(--foreground))' }}>
                {selectedSettlementEmployee?.fullName ?? "Sin seleccionar"}
              </div>
            </div>
            <div style={{ padding: '0.75rem', borderRadius: '0.625rem', border: '1px solid rgba(168,85,247,0.15)', background: 'rgba(168,85,247,0.04)' }}>
              <div className="stat-label">Total</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '1.1rem', fontWeight: 700, color: '#c084fc' }}>
                {money.format(settlementSummary.data?.total ?? 0)}
              </div>
            </div>
            <div style={{ padding: '0.75rem', borderRadius: '0.625rem', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(5,7,16,0.4)' }}>
              <div className="stat-label">Movimientos</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '1.1rem', fontWeight: 700, color: 'hsl(var(--foreground))' }}>
                {settlementSummary.data?.count ?? 0}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {(settlementSummary.data?.byKind ?? []).map((item) => (
              <div
                key={item.kind}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid rgba(255,255,255,0.05)',
                  background: 'rgba(5,7,16,0.4)',
                  fontSize: '0.8rem'
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'hsl(var(--foreground))' }}>{movementLabels[item.kind]}</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }}>{item.count} · {money.format(item.amount)}</span>
              </div>
            ))}
            {settlementEmployeeId && !settlementSummary.isLoading && !settlementSummary.data?.count && (
              <StatusEmpty text="No hay movimientos autorizados por liquidar en este filtro." />
            )}
          </div>

          <button className="btn-authorize" style={{ width: '100%', height: '2.75rem', fontSize: '0.9rem', justifyContent: 'center' }} disabled={!canSettle} onClick={() => settle.mutate()} type="button">
            <CheckCircle2 style={{ width: 14, height: 14 }} />
            Marcar rango como liquidado
          </button>
          {settlementMessage && <div className="status-empty">{settlementMessage}</div>}
          <div style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
            Responsable: <span style={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}>{user?.fullName}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Deliveries() {
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ["me"], queryFn: api.me })
  const [activeTab, setActiveTab] = useState<"pendientes" | "historial">("pendientes")

  const pendingQuery = useQuery({
    queryKey: ["movements", "deliveries-pending"],
    queryFn: () => api.movements({ status: "AUTHORIZED", delivered: "false" }),
    enabled: !!me.data
  })

  const historyQuery = useQuery({
    queryKey: ["movements", "deliveries-history"],
    queryFn: () => {
      const today = new Date().toISOString().slice(0, 10)
      return api.movements({ delivered: "true", from: today })
    },
    enabled: !!me.data
  })

  const deliverMutation = useMutation({
    mutationFn: (id: string) => api.deliverMovement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movements"] })
    }
  })

  const getKindBadgeClass = (kind: MovementKind) => {
    switch (kind) {
      case "DRINK": return "badge-status badge-authorized"
      case "FOOD": return "badge-status badge-discounted"
      case "SALARY_ADVANCE": return "badge-status badge-pending"
      default: return "badge-status badge-partial"
    }
  }

  return (
    <div className="space-y-4">
      <div className="section-header">
        <div className="section-title">
          <CheckCircle2 style={{ width: 16, height: 16, color: '#00e5ff' }} />
          Control de Caja y Entregas
        </div>
        <div className="section-subtitle">
          {me.data?.branch?.name ?? "Caja General"}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/5 pb-2">
        <button
          className={`px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "pendientes" ? "border-b-2 border-cyan-400 text-cyan-400" : "text-muted-foreground"
          }`}
          onClick={() => setActiveTab("pendientes")}
          type="button"
        >
          Pendientes de Entrega ({pendingQuery.data?.length ?? 0})
        </button>
        <button
          className={`px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "historial" ? "border-b-2 border-cyan-400 text-cyan-400" : "text-muted-foreground"
          }`}
          onClick={() => setActiveTab("historial")}
          type="button"
        >
          Entregados Hoy ({historyQuery.data?.length ?? 0})
        </button>
      </div>

      {activeTab === "pendientes" && (
        <div className="space-y-3">
          {pendingQuery.isLoading && <StatusEmpty text="Cargando solicitudes..." />}
          {pendingQuery.data?.length === 0 && (
            <StatusEmpty text="No hay movimientos pendientes de entrega en esta sucursal." />
          )}
          {pendingQuery.data?.map((m) => (
            <div key={m.id} className="admin-card">
              <div className="admin-card-body flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-lg">{m.employee?.fullName}</span>
                    <span className={getKindBadgeClass(m.kind)}>{movementLabels[m.kind] || m.kind}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Folio: <span className="font-mono text-cyan-300">{m.folio}</span> • Solicitado: {new Date(m.createdAt).toLocaleTimeString()}
                  </div>
                  {m.productName && (
                    <div className="text-sm">
                      Producto: <span className="text-white">{m.productName}</span>
                      {m.quantity && ` x ${m.quantity}`}
                    </div>
                  )}
                  {m.reason && <div className="text-sm italic text-muted-foreground">"{m.reason}"</div>}
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Monto</div>
                    <div className="font-semibold text-lg text-emerald-400">{money.format(Number(m.amount))}</div>
                  </div>
                  <button
                    className="btn-authorize px-4 py-2"
                    onClick={() => deliverMutation.mutate(m.id)}
                    disabled={deliverMutation.isPending}
                    type="button"
                  >
                    Confirmar Salida
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "historial" && (
        <div className="space-y-3">
          {historyQuery.isLoading && <StatusEmpty text="Cargando historial..." />}
          {historyQuery.data?.length === 0 && (
            <StatusEmpty text="No se han registrado entregas hoy." />
          )}
          {historyQuery.data?.map((m) => (
            <div key={m.id} className="admin-card opacity-80">
              <div className="admin-card-body flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white/90">{m.employee?.fullName}</span>
                    <span className="badge-status badge-discounted">{movementLabels[m.kind] || m.kind}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Folio: <span className="font-mono">{m.folio}</span> • Entregado a las: {m.deliveredAt ? new Date(m.deliveredAt).toLocaleTimeString() : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Entregado por: <span className="text-cyan-400 font-semibold">{m.deliveredBy?.fullName || "Caja"}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Monto</div>
                  <div className="font-semibold text-white/80">{money.format(Number(m.amount))}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PendingAuthorizations({ currentRole }: { currentRole?: Role }) {
  const queryClient = useQueryClient()
  const pending = useQuery({ queryKey: ["movements", "pending-full"], queryFn: () => api.movements({ status: "PENDING" }) })
  const authorize = useMutation({
    mutationFn: (id: string) => api.authorizeMovement(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["movements"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    }
  })
  const reject = useMutation({
    mutationFn: (id: string) => api.rejectMovement(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["movements"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    }
  })
  const canProcess = currentRole !== "CAJERO" && currentRole !== "EMPLEADO"
  const count = pending.data?.length ?? 0

  return (
    <div className="space-y-4">
      <div className="section-header">
        <div className="section-title">
          <ShieldCheck style={{ width: 16, height: 16, color: '#00e5ff' }} />
          Aprobaciones pendientes
        </div>
        {count > 0 && <span className="section-count">{count}</span>}
      </div>

      {pending.isLoading && <StatusEmpty text="Cargando solicitudes..." />}
      {!pending.isLoading && count === 0 && (
        <div className="empty-state">
          <CheckCircle2 className="empty-state-icon" style={{ width: 48, height: 48, color: '#4ade80' }} />
          <div className="empty-state-text">Todo al día — No hay solicitudes pendientes</div>
        </div>
      )}

      <div className="space-y-3">
        {pending.data?.map((movement, idx) => {
          const name = movement.employee?.fullName ?? "Empleado"
          return (
            <div
              key={movement.id}
              className="approval-card"
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              {/* Header row */}
              <div className="flex items-start gap-3">
                <div className="approval-employee-avatar">{getInitials(name)}</div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: '0.925rem', fontWeight: 700, color: 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '3px', flexWrap: 'wrap' }}>
                    <span className="badge-status badge-pending">Pendiente</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.625rem', color: 'hsl(var(--muted-foreground))' }}>{movement.folio}</span>
                  </div>
                </div>
                <div className="approval-amount" style={{ flexShrink: 0 }}>
                  {money.format(Number(movement.amount))}
                </div>
              </div>

              {/* Detail row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem', marginTop: '0.875rem' }}>
                <div style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(5,7,16,0.4)' }}>
                  <div className="stat-label">Tipo</div>
                  <div style={{ fontSize: '0.775rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>{movementLabels[movement.kind]}</div>
                </div>
                <div style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(5,7,16,0.4)' }}>
                  <div className="stat-label">Fecha</div>
                  <div style={{ fontSize: '0.725rem', color: 'hsl(var(--foreground))' }}>
                    {new Date(movement.createdAt).toLocaleString("es-MX", { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                {movement.reason && (
                  <div style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(5,7,16,0.4)', gridColumn: 'span 2' }}>
                    <div className="stat-label">Motivo</div>
                    <div style={{ fontSize: '0.775rem', color: 'hsl(var(--foreground))' }}>{movement.reason}</div>
                  </div>
                )}
              </div>

              {/* Actions */}
              {canProcess && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.875rem', justifyContent: 'flex-end' }}>
                  <button
                    className="btn-reject"
                    onClick={() => reject.mutate(movement.id)}
                    disabled={reject.isPending || authorize.isPending}
                    type="button"
                  >
                    <X style={{ width: 12, height: 12 }} />
                    Rechazar
                  </button>
                  <button
                    className="btn-authorize"
                    onClick={() => authorize.mutate(movement.id)}
                    disabled={authorize.isPending || reject.isPending}
                    type="button"
                  >
                    <CheckCircle2 style={{ width: 12, height: 12 }} />
                    Autorizar
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '0.625rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(5,7,16,0.4)' }}>
      <div className="stat-label" style={{ marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '0.85rem', color: 'hsl(var(--foreground))', wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}

function startOfCurrentMonth() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  return `${now.getFullYear()}-${month}-01`
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
}

function movementEventLabel(movement: Movement) {
  if (movement.origin === "ADMINISTRATIVE_ACTION") return "Movimiento administrativo"
  if (movement.status === "AUTHORIZED") return "Solicitud aprobada"
  if (movement.status === "REJECTED") return "Solicitud rechazada"
  return "Solicitud creada"
}

function defaultPeriodStart() {
  const now = new Date()
  const day = now.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  now.setDate(now.getDate() + mondayOffset)
  return toDateInput(now)
}

function defaultPeriodEnd() {
  const start = new Date(`${defaultPeriodStart()}T00:00:00`)
  start.setDate(start.getDate() + 6)
  return toDateInput(start)
}

function toDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return "Sin fecha"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString("es-MX")
}

function formatPayrollPeriod(payroll: Pick<Payroll, "periodStart" | "periodEnd">) {
  return `${formatDateLabel(String(payroll.periodStart).slice(0, 10))} a ${formatDateLabel(String(payroll.periodEnd).slice(0, 10))}`
}

function History() {
  const [tab, setTab] = useState<"all" | "employee">("all")
  const [employeeId, setEmployeeId] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [kind, setKind] = useState("")
  const [status, setStatus] = useState("")
  const employees = useQuery({ queryKey: ["employees"], queryFn: () => api.employees() })
  const params = useMemo(
    () => ({
      ...(employeeId ? { employeeId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {})
    }),
    [employeeId, from, kind, status, to]
  )
  const movements = useQuery({ queryKey: ["movements", params], queryFn: () => api.movements(params) })
  const count = movements.data?.length ?? 0

  return (
    <div className="space-y-4">
      {/* Header + Tabs */}
      <div className="section-header">
        <div className="section-title">
          <ClipboardList style={{ width: 16, height: 16, color: '#00e5ff' }} />
          Historial
        </div>
        {count > 0 && <span className="section-count">{count}</span>}
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: '0.375rem', padding: '0.25rem', background: 'rgba(13,17,23,0.8)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.06)', width: 'fit-content' }}>
        <button
          type="button"
          onClick={() => setTab("all")}
          style={{
            padding: '0.375rem 0.875rem',
            borderRadius: '0.5rem',
            fontSize: '0.775rem',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 150ms ease',
            background: tab === "all" ? 'rgba(0,229,255,0.1)' : 'transparent',
            color: tab === "all" ? '#00e5ff' : 'hsl(var(--muted-foreground))'
          }}
        >Todos los movimientos</button>
        <button
          type="button"
          onClick={() => setTab("employee")}
          style={{
            padding: '0.375rem 0.875rem',
            borderRadius: '0.5rem',
            fontSize: '0.775rem',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 150ms ease',
            background: tab === "employee" ? 'rgba(0,229,255,0.1)' : 'transparent',
            color: tab === "employee" ? '#00e5ff' : 'hsl(var(--muted-foreground))'
          }}
        >Por empleado</button>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        {tab === "employee" && (
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">Todos los empleados</option>
            {employees.data?.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.fullName}</option>
            ))}
          </select>
        )}
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="Desde" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="Hasta" />
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Todos los tipos</option>
          {Object.entries(movementLabels).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(statusLabels).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Results */}
      {movements.isLoading && <StatusEmpty text="Buscando movimientos..." />}
      {!movements.isLoading && count === 0 && <StatusEmpty text="Sin movimientos para los filtros seleccionados" />}
      <MovementTable movements={movements.data ?? []} />
    </div>
  )
}

function PayrollAdmin() {
  const queryClient = useQueryClient()
  const [periodStart, setPeriodStart] = useState(() => defaultPeriodStart())
  const [periodEnd, setPeriodEnd] = useState(() => defaultPeriodEnd())
  const [selectedItem, setSelectedItem] = useState<PayrollItem | null>(null)
  const [selectedPayrollId, setSelectedPayrollId] = useState("")
  const [cancelReason, setCancelReason] = useState("")
  const payrolls = useQuery({ queryKey: ["payrolls"], queryFn: api.payrolls })
  const payrollDetail = useQuery({
    queryKey: ["payroll", selectedPayrollId],
    queryFn: () => api.payroll(selectedPayrollId),
    enabled: Boolean(selectedPayrollId)
  })
  const preview = useMutation({
    mutationFn: () => api.payrollPreview(periodStart, periodEnd),
    onSuccess: () => setSelectedItem(null)
  })
  const generate = useMutation({
    mutationFn: () => api.generatePayroll({ period_start: periodStart, period_end: periodEnd }),
    onSuccess: async (payroll) => {
      setSelectedPayrollId(payroll.id)
      await queryClient.invalidateQueries({ queryKey: ["payrolls"] })
      await queryClient.invalidateQueries({ queryKey: ["movements"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    }
  })
  const markPaid = useMutation({
    mutationFn: (id: string) => api.markPayrollPaid(id),
    onSuccess: async (payroll) => {
      setSelectedPayrollId(payroll.id)
      await queryClient.invalidateQueries({ queryKey: ["payrolls"] })
      await queryClient.invalidateQueries({ queryKey: ["payroll", payroll.id] })
    }
  })
  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelPayroll(id, cancelReason),
    onSuccess: async (payroll) => {
      setCancelReason("")
      setSelectedPayrollId(payroll.id)
      await queryClient.invalidateQueries({ queryKey: ["payrolls"] })
      await queryClient.invalidateQueries({ queryKey: ["payroll", payroll.id] })
    }
  })

  const detail = payrollDetail.data
  const canGenerate = Boolean(preview.data?.items.length && !generate.isPending)

  return (
    <div className="space-y-4">
      <div className="section-header">
        <div className="section-title">
          <WalletCards style={{ width: 16, height: 16, color: '#00e5ff' }} />
          Nómina
        </div>
      </div>
      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">Calcular período</div>
        </div>
        <div className="admin-card-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.625rem', alignItems: 'center' }}>
            <input
              type="date"
              className="form-input"
              style={{ flex: '0 0 150px' }}
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
            <input
              type="date"
              className="form-input"
              style={{ flex: '0 0 150px' }}
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
            <button className="btn-secondary" type="button" onClick={() => preview.mutate()} disabled={preview.isPending}>
              Previsualizar
            </button>
            <button className="btn-primary" type="button" disabled={!canGenerate} onClick={() => generate.mutate()}>
              Generar nómina
            </button>
          </div>
          {preview.error && <div className="status-empty" style={{ marginTop: '0.75rem', color: '#f87171' }}>{preview.error.message}</div>}
          {generate.error && <div className="status-empty" style={{ marginTop: '0.75rem', color: '#f87171' }}>{generate.error.message}</div>}
          {preview.data && (
            <div style={{ marginTop: '1rem' }} className="space-y-4">
              <PayrollTotals
                totalGross={preview.data.totals.totalGross}
                totalDeductions={preview.data.totals.totalDeductions}
                totalAdjustments={preview.data.totals.totalAdjustments}
                totalNet={preview.data.totals.totalNet}
              />
              <PayrollItemsTable items={preview.data.items} onSelect={setSelectedItem} />
            </div>
          )}
          {!preview.data && <StatusEmpty text="Selecciona un periodo y previsualiza para calcular la nómina." />}
        </div>
      </div>

      {selectedItem && (
        <PayrollItemDetail title={`Detalle · ${selectedItem.employeeName}`} item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}


      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">Historial de nóminas</div>
        </div>
        <div className="admin-card-body">
          {!payrolls.data?.length && <StatusEmpty text="Sin nóminas generadas." />}
          <div className="space-y-2">
            {payrolls.data?.map((payroll) => (
              <div
                key={payroll.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.875rem',
                  borderRadius: '0.875rem',
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(13,17,23,0.6)'
                }}
              >
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'hsl(var(--foreground))' }}>{formatPayrollPeriod(payroll)}</div>
                  <div style={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))' }}>Generada: {formatDateTime(payroll.generatedAt)}</div>
                </div>
                <span className={getPayrollBadgeClass(payroll.status)}>{payrollStatusLabels[payroll.status]}</span>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '0.95rem', color: '#4ade80' }}>
                  {money.format(payroll.totalNet)}
                </div>
                <button className="btn-ghost" style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem', height: 'auto' }} onClick={() => setSelectedPayrollId(payroll.id)} type="button">
                  Ver detalle
                </button>
                <button
                  className="btn-authorize"
                  style={{ fontSize: '0.725rem', padding: '0.375rem 0.75rem' }}
                  disabled={payroll.status !== "GENERADA" || markPaid.isPending}
                  onClick={() => markPaid.mutate(payroll.id)}
                  type="button"
                >
                  Marcar pagada
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>


      {detail && (
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <div className="admin-card-title">Detalle de nómina</div>
              <div style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', marginTop: '2px' }}>
                {formatPayrollPeriod(detail)} · <span className={getPayrollBadgeClass(detail.status)}>{payrollStatusLabels[detail.status]}</span>
              </div>
            </div>
            <button className="btn-ghost" style={{ fontSize: '0.775rem' }} onClick={() => setSelectedPayrollId("")} type="button">Cerrar</button>
          </div>
          <div className="admin-card-body space-y-4">
            <PayrollTotals
              totalGross={detail.totalGross}
              totalDeductions={detail.totalDeductions}
              totalAdjustments={detail.totalAdjustments}
              totalNet={detail.totalNet}
            />
            <PayrollItemsTable items={detail.items ?? []} onSelect={setSelectedItem} />
            {detail.status === "GENERADA" && (
              <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
                <input
                  className="form-input"
                  placeholder="Motivo de cancelación"
                  style={{ flex: 1, minWidth: 180 }}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
                <button className="btn-reject" disabled={!cancelReason.trim() || cancel.isPending} onClick={() => cancel.mutate(detail.id)} type="button">
                  Cancelar nómina
                </button>
              </div>
            )}
            {cancel.error && <div className="status-empty" style={{ color: '#f87171' }}>{cancel.error.message}</div>}
            {markPaid.error && <div className="status-empty" style={{ color: '#f87171' }}>{markPaid.error.message}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

function PayrollTotals({
  totalGross,
  totalDeductions,
  totalAdjustments,
  totalNet
}: {
  totalGross: number
  totalDeductions: number
  totalAdjustments: number
  totalNet: number
}) {
  return (
    <div className="grid metric-grid gap-3">
      <div className="stat-card">
        <div className="stat-label">Total sueldos</div>
        <div className="stat-value" style={{ fontSize: '1.25rem' }}>{money.format(totalGross)}</div>
      </div>
      <div className="stat-card stat-card-amber">
        <div className="stat-label">Deducciones</div>
        <div className="stat-value stat-value-amber" style={{ fontSize: '1.25rem' }}>{money.format(totalDeductions)}</div>
      </div>
      <div className="stat-card stat-card-violet">
        <div className="stat-label">Ajustes</div>
        <div className="stat-value stat-value-violet" style={{ fontSize: '1.25rem' }}>{money.format(totalAdjustments)}</div>
      </div>
      <div className="stat-card stat-card-green">
        <div className="stat-label">Neto a pagar</div>
        <div className="stat-value stat-value-green" style={{ fontSize: '1.25rem' }}>{money.format(totalNet)}</div>
      </div>
    </div>
  )
}

function PayrollItemsTable({ items, onSelect }: { items: PayrollItem[]; onSelect: (item: PayrollItem) => void }) {
  if (!items.length) return <StatusEmpty text="No hay empleados activos para este periodo." />
  return (
    <div style={{ borderRadius: '0.875rem', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(13,17,23,0.6)', overflowX: 'auto' }}>
      <table className="payroll-table" style={{ minWidth: 780 }}>
        <thead>
          <tr>
            <th>Empleado</th>
            <th>Sueldo base</th>
            <th>Adelantos</th>
            <th>Consumos</th>
            <th>Cargos</th>
            <th>Ajustes</th>
            <th>Neto a pagar</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.employeeId}>
              <td>
                <div style={{ fontWeight: 600, fontSize: '0.825rem' }}>{item.employeeName}</div>
                <div style={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))' }}>{item.position}</div>
              </td>
              <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.825rem' }}>{money.format(item.baseSalary)}</td>
              <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.825rem', color: '#fbbf24' }}>{money.format(item.totalAdvances)}</td>
              <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.825rem' }}>{money.format(item.totalInternalConsumption)}</td>
              <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.825rem' }}>{money.format(item.totalAdminCharges + item.totalPenalties)}</td>
              <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.825rem' }}>{money.format(item.totalPositiveAdjustments - item.totalNegativeAdjustments)}</td>
              <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9rem', fontWeight: 700, color: '#4ade80' }}>{money.format(item.netPay)}</td>
              <td>
                <button className="btn-ghost" style={{ fontSize: '0.725rem', padding: '0.25rem 0.625rem', height: 'auto' }} onClick={() => onSelect(item)} type="button">
                  Detalle
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PayrollItemDetail({ title, item, onClose }: { title: string; item: PayrollItem; onClose: () => void }) {
  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <div>
          <div className="admin-card-title">{title}</div>
          <div style={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', marginTop: '2px' }}>{item.movements.length} movimiento(s)</div>
        </div>
        <button className="btn-ghost" style={{ fontSize: '0.775rem' }} onClick={onClose} type="button">Cerrar</button>
      </div>
      <div className="admin-card-body space-y-3">
        <div className="grid gap-2 md:grid-cols-4">
          <DetailLine label="Sueldo base" value={money.format(item.baseSalary)} />
          <DetailLine label="Deducciones" value={money.format(item.totalDeductions)} />
          <DetailLine label="Ajustes" value={money.format(item.totalPositiveAdjustments)} />
          <DetailLine label="Neto" value={money.format(item.netPay)} />
        </div>
        <div className="space-y-2">
          {item.movements.map((movement) => (
            <div
              key={movement.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '100px 1fr auto',
                gap: '0.625rem',
                alignItems: 'center',
                padding: '0.625rem',
                borderRadius: '0.625rem',
                border: '1px solid rgba(255,255,255,0.05)',
                background: 'rgba(5,7,16,0.4)'
              }}
            >
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.625rem', color: 'hsl(var(--muted-foreground))' }}>{movement.folio}</div>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>{movementLabels[movement.kind]}</div>
                <div style={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))' }}>{movement.reason}</div>
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '0.875rem', color: 'hsl(var(--foreground))' }}>{money.format(movement.amount)}</div>
            </div>
          ))}
          {!item.movements.length && <StatusEmpty text="Sin movimientos para este empleado." />}
        </div>
      </div>
    </div>
  )
}

function MovementTable({
  movements,
  actions
}: {
  movements: Movement[]
  actions?: (movement: Movement) => React.ReactNode
}) {
  if (!movements.length) return null

  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {movements.map((movement, idx) => (
          <div
            key={movement.id}
            className="movement-row"
            style={{ animationDelay: `${idx * 30}ms`, flexDirection: 'column', alignItems: 'stretch', gap: '0.625rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'hsl(var(--foreground))' }}>
                  {movement.employee?.fullName ?? "Empleado"}
                </div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.625rem', color: 'hsl(var(--muted-foreground))' }}>{movement.folio}</div>
              </div>
              <span className={getStatusBadgeClass(movement.status)}>{statusLabels[movement.status]}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem' }}>
              <div style={{ fontSize: '0.775rem', color: 'hsl(var(--muted-foreground))' }}>{movementLabels[movement.kind]}</div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'hsl(var(--foreground))' }}>
                {money.format(Number(movement.amount))}
              </div>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))' }}>
              {new Date(movement.createdAt).toLocaleString("es-MX")}
            </div>
            {actions?.(movement) && <div>{actions(movement)}</div>}
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block" style={{ borderRadius: '0.875rem', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(13,17,23,0.6)' }}>
        <table className="payroll-table">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Empleado</th>
              <th>Tipo</th>
              <th>Monto</th>
              <th>Estado</th>
              <th>Fecha</th>
              {actions && <th>Acción</th>}
            </tr>
          </thead>
          <tbody>
            {movements.map((movement) => (
              <tr key={movement.id}>
                <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))' }}>{movement.folio}</td>
                <td>
                  <div style={{ fontWeight: 600, fontSize: '0.825rem' }}>{movement.employee?.fullName ?? "Empleado"}</div>
                  <div style={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))' }}>
                    {movement.origin === "EMPLOYEE_REQUEST" ? "Solicitud" : "Administrativo"}
                  </div>
                </td>
                <td style={{ fontSize: '0.8rem' }}>{movementLabels[movement.kind]}</td>
                <td style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, fontSize: '0.875rem', color: 'hsl(var(--foreground))' }}>
                  {money.format(Number(movement.amount))}
                </td>
                <td><span className={getStatusBadgeClass(movement.status)}>{statusLabels[movement.status]}</span></td>
                <td style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>
                  {new Date(movement.createdAt).toLocaleString("es-MX")}
                </td>
                {actions && <td>{actions(movement)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Employees({ user }: { user?: User }) {
  const queryClient = useQueryClient()
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("")
  const employees = useQuery({ queryKey: ["employees", "admin-all"], queryFn: () => api.employees(undefined, true) })
  const branches = useQuery({ queryKey: ["branches"], queryFn: api.branches })
  const selectedEmployee = employees.data?.find((employee) => employee.id === selectedEmployeeId)
  
  const form = useForm<EmployeeFormInput, unknown, EmployeeFormOutput>({
    resolver: zodResolver(employeeSchema),
    defaultValues: { salaryAmount: 0, salaryType: "WEEKLY", hireDate: "", branchId: user?.branch?.id || "" }
  })
  
  const editForm = useForm<EmployeeEditFormInput, unknown, EmployeeEditFormOutput>({
    resolver: zodResolver(employeeEditSchema),
    defaultValues: { fullName: "", position: "", phone: "", pin: "", salaryAmount: 0, salaryType: "WEEKLY", hireDate: "", branchId: "" }
  })

  useEffect(() => {
    if (user?.branch?.id) {
      form.setValue("branchId", user.branch.id)
    }
  }, [user?.branch?.id, form])

  const create = useMutation({
    mutationFn: (payload: EmployeeFormOutput) =>
      api.createEmployee(payload),
    onSuccess: async () => {
      form.reset({ salaryAmount: 0, salaryType: "WEEKLY", hireDate: "", branchId: user?.branch?.id || "" })
      await queryClient.invalidateQueries({ queryKey: ["employees"] })
    }
  })
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EmployeeEditFormOutput }) =>
      api.updateEmployee(id, { ...payload, pin: payload.pin || undefined }),
    onSuccess: async (employee) => {
      setSelectedEmployeeId(employee.id)
      await queryClient.invalidateQueries({ queryKey: ["employees"] })
    }
  })
  const toggleActive = useMutation({
    mutationFn: (employee: Employee) => api.updateEmployee(employee.id, { active: !employee.active }),
    onSuccess: async (employee) => {
      setSelectedEmployeeId(employee.id)
      await queryClient.invalidateQueries({ queryKey: ["employees"] })
    }
  })

  useEffect(() => {
    if (!selectedEmployee) return
    editForm.reset({
      fullName: selectedEmployee.fullName,
      position: selectedEmployee.position,
      phone: selectedEmployee.phone,
      pin: "",
      salaryAmount: Number(selectedEmployee.salaryAmount ?? 0),
      salaryType: selectedEmployee.salaryType ?? "WEEKLY",
      hireDate: selectedEmployee.hireDate ? selectedEmployee.hireDate.slice(0, 10) : "",
      branchId: selectedEmployee.branch?.id || ""
    })
  }, [editForm, selectedEmployee])

  return (
    <div className="space-y-4">
      <div className="section-header">
        <div className="section-title">
          <UsersRound style={{ width: 16, height: 16, color: '#00e5ff' }} />
          Empleados
        </div>
        {employees.data && <span className="section-count">{employees.data.length}</span>}
      </div>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {/* Create form */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div className="admin-card-title">
              <UserRoundPlus style={{ width: 14, height: 14, color: '#00e5ff' }} />
              Alta de empleado
            </div>
          </div>
          <div className="admin-card-body">
            <form className="space-y-2.5" onSubmit={form.handleSubmit((values) => create.mutate(values))}>
              <input className="form-input" placeholder="Nombre completo" {...form.register("fullName")} />
              <input className="form-input" placeholder="Puesto" {...form.register("position")} />
              <input className="form-input" placeholder="Teléfono" {...form.register("phone")} />
              <input className="form-input" type="password" placeholder="PIN (6 dígitos)" {...form.register("pin")} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <input className="form-input" type="number" step="0.01" placeholder="Sueldo base" {...form.register("salaryAmount")} />
                <select className="form-select" {...form.register("salaryType")}>
                  {Object.entries(salaryTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <input className="form-input" type="date" {...form.register("hireDate")} />
              <select className="form-select" {...form.register("branchId")}>
                <option value="">Selecciona Sucursal</option>
                {branches.data?.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <button className="btn-primary" style={{ width: '100%' }} disabled={create.isPending} type="submit">
                Crear empleado
              </button>
              {create.error && <div className="status-empty" style={{ color: '#f87171', padding: '0.5rem' }}>{create.error.message}</div>}
            </form>
          </div>
        </div>

        {/* Edit form */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div className="admin-card-title">
              <KeyRound style={{ width: 14, height: 14, color: '#00e5ff' }} />
              Edición y PIN
            </div>
          </div>
          <div className="admin-card-body">
            {!selectedEmployee && <StatusEmpty text="Selecciona un empleado de la lista para editarlo." />}
            {selectedEmployee && (
              <form
                className="space-y-2.5"
                onSubmit={editForm.handleSubmit((values) => update.mutate({ id: selectedEmployee.id, payload: values }))}
              >
                <input className="form-input" placeholder="Nombre completo" {...editForm.register("fullName")} />
                <input className="form-input" placeholder="Puesto" {...editForm.register("position")} />
                <input className="form-input" placeholder="Teléfono" {...editForm.register("phone")} />
                <input className="form-input" type="password" placeholder="Nuevo PIN (opcional)" {...editForm.register("pin")} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <input className="form-input" type="number" step="0.01" placeholder="Sueldo" {...editForm.register("salaryAmount")} />
                  <select className="form-select" {...editForm.register("salaryType")}>
                    {Object.entries(salaryTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <input className="form-input" type="date" {...editForm.register("hireDate")} />
                <select className="form-select" {...editForm.register("branchId")}>
                  <option value="">Selecciona Sucursal</option>
                  {branches.data?.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button className="btn-primary" disabled={update.isPending} type="submit">Guardar</button>
                  <button
                    className={selectedEmployee.active ? "btn-reject" : "btn-authorize"}
                    type="button"
                    disabled={toggleActive.isPending}
                    onClick={() => toggleActive.mutate(selectedEmployee)}
                  >
                    {selectedEmployee.active ? "Desactivar" : "Activar"}
                  </button>
                </div>
                {update.error && <div className="status-empty" style={{ color: '#f87171', padding: '0.5rem' }}>{update.error.message}</div>}
                {toggleActive.error && <div className="status-empty" style={{ color: '#f87171', padding: '0.5rem' }}>{toggleActive.error.message}</div>}
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Employee grid */}
      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">Directorio de empleados</div>
        </div>
        <div className="admin-card-body">
          <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {employees.data?.map((employee: Employee) => (
              <button
                key={employee.id}
                className={`employee-card ${selectedEmployeeId === employee.id ? "selected" : ""}`}
                type="button"
                onClick={() => setSelectedEmployeeId(employee.id)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.375rem' }}>
                  <div className="employee-card-name">{employee.fullName}</div>
                  <span className={employee.active ? "badge-status badge-authorized" : "badge-status badge-canceled"} style={{ flexShrink: 0 }}>
                    {employee.active ? "Activo" : "Inact."}
                  </span>
                </div>
                <div className="employee-card-info">{employee.phone} · {employee.position}</div>
                <div className="employee-card-info" style={{ marginTop: '4px' }}>
                  {salaryTypeLabels[employee.salaryType ?? "WEEKLY"]} · {money.format(Number(employee.salaryAmount ?? 0))}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Configuration() {
  const queryClient = useQueryClient()
  const [selectedUserId, setSelectedUserId] = useState("")
  const configuration = useQuery({ queryKey: ["configuration"], queryFn: api.configuration })
  const rules = useQuery({ queryKey: ["rules"], queryFn: api.rules })
  const branches = useQuery({ queryKey: ["branches"], queryFn: api.branches })
  const adminUsers = useQuery({ queryKey: ["admin-users"], queryFn: api.adminUsers })
  const selectedUser = adminUsers.data?.find((user) => user.id === selectedUserId)
  const configForm = useForm<ConfigFormInput, unknown, ConfigFormOutput>({
    resolver: zodResolver(configSchema),
    defaultValues: { beveragePrice: 30 }
  })
  const form = useForm<RuleFormInput, unknown, RuleFormOutput>({
    resolver: zodResolver(ruleSchema),
    defaultValues: { requiredRole: "ENCARGADO", minAmount: 0 }
  })
  const userForm = useForm<AdminUserFormInput, unknown, AdminUserFormOutput>({
    resolver: zodResolver(adminUserSchema),
    defaultValues: { role: "ENCARGADO", branchId: "" }
  })
  const userEditForm = useForm<AdminUserEditFormInput, unknown, AdminUserEditFormOutput>({
    resolver: zodResolver(adminUserEditSchema),
    defaultValues: { fullName: "", email: "", password: "", role: "ENCARGADO", branchId: "" }
  })
  useEffect(() => {
    if (configuration.data) {
      configForm.reset({ beveragePrice: Number(configuration.data.beveragePrice ?? 30) })
    }
  }, [configForm, configuration.data])
  useEffect(() => {
    if (!selectedUser) return
    userEditForm.reset({
      fullName: selectedUser.fullName,
      email: selectedUser.email,
      password: "",
      role: selectedUser.role as AdminUserEditFormInput["role"],
      branchId: selectedUser.branch?.id ?? ""
    })
  }, [selectedUser, userEditForm])
  const updateConfig = useMutation({
    mutationFn: (values: ConfigFormOutput) => api.updateConfiguration({ beveragePrice: values.beveragePrice }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["configuration"] })
  })
  const createRule = useMutation({
    mutationFn: (values: RuleFormOutput) =>
      api.createRule({ ...values, kind: values.kind || undefined, maxAmount: values.maxAmount || undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rules"] })
  })
  const createUser = useMutation({
    mutationFn: (values: AdminUserFormOutput) => api.createAdminUser(values),
    onSuccess: async () => {
      userForm.reset({ role: "ENCARGADO", fullName: "", email: "", password: "" })
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    }
  })
  const updateUser = useMutation({
    mutationFn: ({ id, values }: { id: string; values: AdminUserEditFormOutput }) =>
      api.updateAdminUser(id, { ...values, password: values.password || undefined }),
    onSuccess: async (user) => {
      setSelectedUserId(user.id)
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    }
  })
  const toggleUser = useMutation({
    mutationFn: (user: User) => api.updateAdminUser(user.id, { active: !user.active }),
    onSuccess: async (user) => {
      setSelectedUserId(user.id)
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    }
  })

  return (
    <div className="space-y-4">
      <div className="section-header">
        <div className="section-title">
          <Settings style={{ width: 16, height: 16, color: '#00e5ff' }} />
          Configuración
        </div>
      </div>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {/* Beverage price */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div className="admin-card-title">
              <Banknote style={{ width: 14, height: 14, color: '#fbbf24' }} />
              Precio de bebida
            </div>
          </div>
          <div className="admin-card-body">
            <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', marginBottom: '0.75rem' }}>Se aplica automáticamente al solicitar bebida.</p>
            <form className="space-y-2.5" onSubmit={configForm.handleSubmit((values) => updateConfig.mutate(values))}>
              <input className="form-input" type="number" step="0.01" placeholder="Precio" {...configForm.register("beveragePrice")} />
              <button className="btn-primary" style={{ width: '100%' }} disabled={updateConfig.isPending} type="submit">Guardar precio</button>
            </form>
          </div>
        </div>

        {/* New admin rule */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div className="admin-card-title">
              <ShieldCheck style={{ width: 14, height: 14, color: '#a855f7' }} />
              Nueva regla de autorización
            </div>
          </div>
          <div className="admin-card-body">
            <form className="space-y-2.5" onSubmit={form.handleSubmit((values) => createRule.mutate(values))}>
              <select className="form-select" {...form.register("kind")}>
                <option value="">Todos los tipos</option>
                {Object.entries(movementLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <input className="form-input" type="number" step="0.01" placeholder="Monto mínimo" {...form.register("minAmount")} />
                <input className="form-input" type="number" step="0.01" placeholder="Monto máximo" {...form.register("maxAmount")} />
              </div>
              <select className="form-select" {...form.register("requiredRole")}>
                {["ENCARGADO", "GERENTE", "ADMINISTRADOR"].map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <button className="btn-primary" style={{ width: '100%' }} type="submit">Guardar regla</button>
            </form>
          </div>
        </div>

        {/* New admin user */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div className="admin-card-title">
              <UserRoundPlus style={{ width: 14, height: 14, color: '#00e5ff' }} />
              Nuevo usuario del sistema
            </div>
          </div>
          <div className="admin-card-body">
            <form className="space-y-2.5" onSubmit={userForm.handleSubmit((values) => createUser.mutate(values))}>
              <input className="form-input" placeholder="Nombre completo" {...userForm.register("fullName")} />
              <input className="form-input" placeholder="Correo electrónico" type="email" {...userForm.register("email")} />
              <input className="form-input" placeholder="Contraseña temporal" type="password" {...userForm.register("password")} />
              <select className="form-select" {...userForm.register("role")}>
                {["ENCARGADO", "GERENTE", "CAJERO", "ADMINISTRADOR"].map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <select className="form-select" {...userForm.register("branchId")}>
                <option value="">Sin sucursal (Matriz/Global)</option>
                {branches.data?.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <button className="btn-primary" style={{ width: '100%' }} disabled={createUser.isPending} type="submit">Crear usuario</button>
              {createUser.error && <div className="status-empty" style={{ color: '#f87171', padding: '0.5rem' }}>{createUser.error.message}</div>}
            </form>
          </div>
        </div>

        {/* Edit user */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div className="admin-card-title">
              <KeyRound style={{ width: 14, height: 14, color: '#00e5ff' }} />
              Editar acceso de usuario
            </div>
          </div>
          <div className="admin-card-body">
            {!selectedUser && <StatusEmpty text="Selecciona un usuario de la lista para editarlo." />}
            {selectedUser && (
              <form
                className="space-y-2.5"
                onSubmit={userEditForm.handleSubmit((values) => updateUser.mutate({ id: selectedUser.id, values }))}
              >
                <input className="form-input" placeholder="Nombre completo" {...userEditForm.register("fullName")} />
                <input className="form-input" placeholder="Correo" type="email" {...userEditForm.register("email")} />
                <input className="form-input" placeholder="Nueva contraseña (opcional)" type="password" {...userEditForm.register("password")} />
                <select className="form-select" {...userEditForm.register("role")}>
                  {["ENCARGADO", "GERENTE", "CAJERO", "ADMINISTRADOR"].map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
                <select className="form-select" {...userEditForm.register("branchId")}>
                  <option value="">Sin sucursal (Matriz/Global)</option>
                  {branches.data?.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button className="btn-primary" disabled={updateUser.isPending} type="submit">Guardar</button>
                  <button
                    className={selectedUser.active ? "btn-reject" : "btn-authorize"}
                    type="button"
                    disabled={toggleUser.isPending}
                    onClick={() => toggleUser.mutate(selectedUser)}
                  >
                    {selectedUser.active ? "Desactivar" : "Activar"}
                  </button>
                </div>
                {updateUser.error && <div className="status-empty" style={{ color: '#f87171', padding: '0.5rem' }}>{updateUser.error.message}</div>}
                {toggleUser.error && <div className="status-empty" style={{ color: '#f87171', padding: '0.5rem' }}>{toggleUser.error.message}</div>}
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Admin users list */}
      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">Usuarios administrativos</div>
          {adminUsers.data && <span className="section-count">{adminUsers.data.length}</span>}
        </div>
        <div className="admin-card-body">
          <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {adminUsers.data?.map((user) => (
              <button
                key={user.id}
                className={`employee-card ${selectedUserId === user.id ? "selected" : ""}`}
                type="button"
                onClick={() => setSelectedUserId(user.id)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '3px' }}>
                  <div className="employee-card-name">{user.fullName}</div>
                  <span className={user.active ? "badge-status badge-authorized" : "badge-status badge-canceled"} style={{ flexShrink: 0 }}>
                    {user.active ? "Activo" : "Inact."}
                  </span>
                </div>
                <div className="employee-card-info">{user.email}</div>
                <div className="employee-card-info" style={{ marginTop: '4px', color: '#a855f7', fontWeight: 600 }}>
                  {user.role} {user.branch ? `• ${user.branch.name}` : ""}
                </div>
              </button>
            ))}
            {!adminUsers.data?.length && <StatusEmpty text="Sin usuarios administrativos." />}
          </div>
        </div>
      </div>

      {/* Rules */}
      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">Reglas de autorización activas</div>
          {rules.data && <span className="section-count">{rules.data.length}</span>}
        </div>
        <div className="admin-card-body">
          <div className="space-y-2">
            {rules.data?.map((rule) => (
              <div
                key={rule.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  padding: '0.625rem 0.75rem',
                  borderRadius: '0.625rem',
                  border: '1px solid rgba(168,85,247,0.15)',
                  background: 'rgba(168,85,247,0.04)',
                  fontSize: '0.8rem'
                }}
              >
                <span style={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}>
                  {rule.kind ? movementLabels[rule.kind as MovementKind] : "Todos los tipos"}
                </span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                  {money.format(Number(rule.minAmount))} – {rule.maxAmount ? money.format(Number(rule.maxAmount)) : "∞"}
                </span>
                <span className="badge-status badge-discounted">{rule.requiredRole}</span>
              </div>
            ))}
            {!rules.data?.length && <StatusEmpty text="Sin reglas de autorización configuradas." />}
          </div>
        </div>
      </div>
    </div>
  )
}

function EmployeePortal({ onLogout }: { onLogout: () => void }) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<"home" | "request" | "history">("home")
  const [historyTab, setHistoryTab] = useState<"current" | "settled">("current")
  const [accountOpen, setAccountOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [codeMessage, setCodeMessage] = useState<string | null>(null)
  const me = useQuery({ queryKey: ["employeePortal", "me"], queryFn: api.employeePortal.me })
  const balance = useQuery({ queryKey: ["employeePortal", "balance"], queryFn: api.employeePortal.balance })
  const movements = useQuery({ queryKey: ["employeePortal", "movements"], queryFn: api.employeePortal.movements })
  const settlementTickets = useQuery({ queryKey: ["employeePortal", "settlementTickets"], queryFn: api.employeePortal.settlementTickets })
  const options = useQuery({ queryKey: ["employeePortal", "options"], queryFn: api.employeePortal.options })
  const form = useForm<EmployeeRequestFormInput, unknown, EmployeeRequestFormOutput>({
    resolver: zodResolver(employeeRequestSchema),
    defaultValues: { kind: "SALARY_ADVANCE", amount: 0, reason: "" }
  })
  const codeForm = useForm({ defaultValues: { currentCode: "", newCode: "" } })
  const selectedKind = form.watch("kind")
  const values = form.watch()
  const beveragePrice = Number(options.data?.beveragePrice ?? 30)
  const isDrink = selectedKind === "DRINK"
  const requestAmount = isDrink ? beveragePrice : Number(values.amount || 0)
  const requestReason = values.reason?.trim() ?? ""

  const { scrollDir, isNearTop } = useScrollDirection()
  const showNav = isNearTop || scrollDir === "up"

  useEffect(() => {
    if (selectedKind === "DRINK") {
      form.setValue("amount", beveragePrice)
      form.setValue("productName", "Bebida")
      form.setValue("quantity", 1)
      form.setValue("unitPrice", beveragePrice)
      setConfirming(false)
    }
  }, [beveragePrice, form, selectedKind])

  const handleInvalidRequest = (errors: Record<string, unknown>) => {
    setConfirming(false)
    if ("amount" in errors) {
      setRequestError("El monto debe ser mayor a $0")
      return
    }
    if ("reason" in errors) {
      setRequestError("Agrega un motivo para continuar")
      return
    }
    setRequestError("Revisa los datos de la solicitud")
  }

  const prepareRequestConfirmation = (payload: EmployeeRequestFormOutput) => {
    if (payload.amount <= 0) {
      setRequestError("El monto debe ser mayor a $0")
      return
    }
    if (payload.kind !== "DRINK" && !payload.reason?.trim()) {
      setRequestError("Agrega un motivo para continuar")
      return
    }
    setMessage(null)
    setRequestError(null)
    setConfirming(true)
  }

  const appendQuickReason = (reason: string) => {
    const currentReason = form.getValues("reason")?.trim()
    const nextReason = currentReason
      ? currentReason.toLowerCase().includes(reason.toLowerCase())
        ? currentReason
        : `${currentReason}, ${reason}`
      : reason
    form.setValue("reason", nextReason, { shouldDirty: true, shouldValidate: true })
    setConfirming(false)
    setRequestError(null)
  }

  const create = useMutation({
    mutationFn: (payload: EmployeeRequestFormOutput) =>
      api.employeePortal.createRequest(
        payload.kind === "DRINK"
          ? { ...payload, amount: beveragePrice, productName: "Bebida", quantity: 1, unitPrice: beveragePrice }
          : payload
      ),
    onSuccess: async (movement) => {
      setMessage(`Solicitud ${movement.folio} enviada`)
      setConfirming(false)
      setRequestError(null)
      form.reset({ kind: "SALARY_ADVANCE", amount: 0, reason: "" })
      await queryClient.invalidateQueries({ queryKey: ["employeePortal"] })
    },
    onError: (err: Error) => {
      setConfirming(false)
      setMessage(err.message)
    }
  })
  const changeCode = useMutation({
    mutationFn: ({ currentCode, newCode }: { currentCode: string; newCode: string }) =>
      api.employeePortal.changeCode(currentCode, newCode),
    onSuccess: async () => {
      setCodeMessage("Código actualizado")
      codeForm.reset({ currentCode: "", newCode: "" })
    },
    onError: (err: Error) => setCodeMessage(err.message)
  })
  const currentMovements = (movements.data ?? []).filter((movement) => movement.status !== "DISCOUNTED")
  const recentMovements = currentMovements.slice(0, 3)

  return (
    <main className="employee-shell min-h-screen">
      {/* Employee Header */}
      <header 
        className="employee-header"
        style={{ transform: showNav ? "translateY(0)" : "translateY(-100%)" }}
      >
        <div className="flex items-center h-full">
          <img src={fatboyLogo} alt="Fatboy" style={{ height: '95%', maxHeight: '49px', objectFit: 'contain' }} className="w-auto opacity-95 filter drop-shadow-[0_0_8px_rgba(0,229,255,0.3)]" />
        </div>
        <button
          className="btn-icon rounded-full border border-white/10 bg-white/[0.08] text-[#f7efe3] hover:bg-white/[0.12] w-10 h-10 flex items-center justify-center cursor-pointer"
          onClick={() => {
            setCodeMessage(null)
            setAccountOpen(true)
          }}
          aria-label="Abrir cuenta"
          type="button"
        >
          <UserRound className="h-5 w-5" />
        </button>
      </header>

      {/* Account Settings Modal */}
      {accountOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" onClick={() => setAccountOpen(false)}>
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0d1117] p-5 shadow-2xl shadow-black/40" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UserRound className="h-6 w-6" />
                </div>
                <div className="mt-3 truncate text-lg font-semibold">{me.data?.fullName ?? "Empleado"}</div>
                <div className="text-xs text-muted-foreground mt-1">{me.data?.position ?? "Puesto"}</div>
              </div>
              <button className="h-10 w-10 rounded-full hover:bg-white/10 flex items-center justify-center border-none bg-transparent cursor-pointer text-muted-foreground" onClick={() => setAccountOpen(false)} aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4" onSubmit={codeForm.handleSubmit((values) => changeCode.mutate(values))}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <KeyRound className="h-4 w-4 text-primary" />
                Cambiar PIN privado
              </div>
              <input className="form-input h-12 rounded-xl border-white/10 bg-black/20" placeholder="Código PIN actual" type="password" inputMode="numeric" maxLength={6} {...codeForm.register("currentCode")} />
              <input className="form-input h-12 rounded-xl border-white/10 bg-black/20" placeholder="Nuevo código PIN" type="password" inputMode="numeric" maxLength={6} {...codeForm.register("newCode")} />
              <button className="btn-primary h-12 w-full rounded-xl" disabled={changeCode.isPending} type="submit">
                {changeCode.isPending ? "Actualizando PIN..." : "Actualizar PIN"}
              </button>
              {codeMessage && <div className="text-xs text-muted-foreground text-center mt-1">{codeMessage}</div>}
            </form>

            <button
              className="mt-4 h-12 w-full rounded-2xl hover:bg-white/5 border border-white/10 bg-transparent text-muted-foreground hover:text-foreground transition flex items-center justify-center gap-2 cursor-pointer font-semibold"
              onClick={() => {
                employeeSession.token = null
                setAccountOpen(false)
                onLogout()
              }}
              type="button"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}

      {/* Main Page Area */}
      <div className="mx-auto max-w-md space-y-5 p-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        {activeTab === "home" && (
          <>
            {/* Profile Banner */}
            <section className="employee-profile-banner">
              <div className="employee-avatar-ring">
                {me.data?.fullName ? getInitials(me.data.fullName) : "E"}
              </div>
              <div className="employee-meta">
                <div className="employee-meta-name">{me.data?.fullName ?? "Empleado"}</div>
                <div className="employee-meta-details">
                  <div className="employee-meta-item">
                    <UserRound style={{ color: 'hsl(var(--primary))' }} />
                    <span>{me.data?.position ?? "Puesto"}</span>
                  </div>
                  <div className="employee-meta-item">
                    <Building2 style={{ color: 'hsl(var(--accent))' }} />
                    <span>{me.data?.branch?.name ?? "Sucursal"}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Balance Card Hero */}
            <section className="employee-balance-card">
              <div className="employee-balance-label">
                <Banknote style={{ width: 14, height: 14 }} />
                Saldo pendiente por descontar
              </div>
              <div className="employee-balance-value">
                {money.format(balance.data?.pendingBalance ?? 0)}
              </div>
              <div className="employee-balance-footer">
                <span>Total acumulado en el periodo actual</span>
                <span className="badge-status badge-authorized" style={{ fontSize: '0.6rem' }}>Activo</span>
              </div>
            </section>

            <PortalMovementList compact title="Últimos Movimientos" movements={recentMovements} />
          </>
        )}

        {activeTab === "request" && (
          <div className="admin-card" style={{ background: 'rgba(13,17,23,0.8)' }}>
            <div className="admin-card-header">
              <div className="admin-card-title">
                <Banknote style={{ width: 16, height: 16, color: '#00e5ff' }} />
                Nueva Solicitud
              </div>
            </div>
            <div className="admin-card-body">
              <form
                className="space-y-4"
                noValidate
                onSubmit={form.handleSubmit(prepareRequestConfirmation, handleInvalidRequest)}
              >
                <GuidedBlock step="1" title="Tipo de Adelanto" detail="Selecciona la categoría de tu solicitud">
                  <div className="employee-action-grid">
                    {employeeRequestKinds.map((k) => {
                      const active = selectedKind === k
                      const Icon = k === "SALARY_ADVANCE" ? Banknote : k === "DRINK" ? WalletCards : Building2
                      return (
                        <button
                          key={k}
                          type="button"
                          className={`employee-action-btn ${active ? "active" : ""}`}
                          onClick={() => {
                            form.setValue("kind", k as EmployeeRequestFormInput["kind"])
                            setConfirming(false)
                            setRequestError(null)
                          }}
                        >
                          <Icon />
                          <span className="employee-action-label" style={{ fontSize: '0.675rem' }}>{movementLabels[k]}</span>
                        </button>
                      )
                    })}
                  </div>
                </GuidedBlock>

                <GuidedBlock
                  step="2"
                  title={isDrink ? "Consumo de bebida" : "Monto de la Solicitud"}
                  detail={isDrink ? "Precio fijo configurado por administración" : "Captura el monto a solicitar"}
                >
                  {isDrink ? (
                    <div className="flex h-12 items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 text-sm">
                      <span className="text-muted-foreground">Bebida consumida</span>
                      <span className="font-mono text-base font-bold text-foreground">{money.format(beveragePrice)}</span>
                    </div>
                  ) : (
                    <input
                      className="form-input h-12"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="Monto ($)"
                      {...form.register("amount", {
                        onChange: () => {
                          setConfirming(false)
                          setRequestError(null)
                        }
                      })}
                    />
                  )}
                  <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2.5 text-xs">
                    <span className="text-muted-foreground">Total de la solicitud</span>
                    <span className="font-mono text-sm font-bold text-primary">{money.format(Number.isFinite(requestAmount) ? requestAmount : 0)}</span>
                  </div>
                </GuidedBlock>

                {!isDrink && (
                  <GuidedBlock step="3" title="Motivo" detail="Razón corta obligatoria para la solicitud">
                    <div className="flex flex-wrap gap-1.5">
                      {quickRequestReasons.map((reason) => (
                        <button
                          key={reason}
                          className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[0.675rem] font-semibold text-primary transition active:bg-primary/20"
                          type="button"
                          onClick={() => appendQuickReason(reason)}
                        >
                          {reason}
                        </button>
                      ))}
                    </div>
                    <textarea
                      className="form-textarea mt-2"
                      placeholder="Escribe brevemente tu motivo..."
                      {...form.register("reason", {
                        onChange: () => {
                          setConfirming(false)
                          setRequestError(null)
                        }
                      })}
                    />
                  </GuidedBlock>
                )}

                {requestError && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive-foreground text-center">
                    {requestError}
                  </div>
                )}
                
                <button className="btn-primary h-12 w-full rounded-xl text-sm" disabled={create.isPending} type="submit">
                  {create.isPending ? "Procesando..." : isDrink ? "Revisar consumo de bebida" : "Continuar"}
                </button>
                <p className="px-1 text-center text-[10px] text-muted-foreground leading-relaxed">
                  *Las solicitudes se envían al panel de administración para su aprobación y posterior deducción de nómina.
                </p>
                {message && (
                  <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-xs text-center text-muted-foreground mt-2">
                    {message}
                  </div>
                )}
              </form>
            </div>
          </div>
        )}

        {confirming && activeTab === "request" && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" onClick={() => setConfirming(false)}>
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0d1117] p-5 shadow-2xl shadow-black/40" onClick={(event) => event.stopPropagation()}>
              <div className="space-y-1">
                <div className="text-base font-bold text-foreground">{isDrink ? "Confirmar consumo de bebida" : "Confirmar Solicitud"}</div>
                <p className="text-xs text-muted-foreground">
                  {isDrink
                    ? "Confirma que estás solicitando el descuento por esta bebida consumida."
                    : "Verifica que los datos sean correctos antes de enviarla."}
                </p>
              </div>
              <div className="mt-4 space-y-2.5 rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-xs">
                <DetailLine label={isDrink ? "Concepto" : "Categoría de adelanto"} value={movementLabels[values.kind as MovementKind]} />
                <DetailLine label="Importe total" value={money.format(Number.isFinite(requestAmount) ? requestAmount : 0)} />
                {!isDrink && <DetailLine label="Motivo especificado" value={requestReason || "Sin motivo"} />}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="btn-secondary h-12 rounded-xl text-xs" type="button" onClick={() => setConfirming(false)}>
                  Cancelar
                </button>
                <button
                  className="btn-primary h-12 rounded-xl text-xs"
                  type="button"
                  disabled={create.isPending}
                  onClick={form.handleSubmit((payload) => {
                    setRequestError(null)
                    create.mutate(payload)
                  }, handleInvalidRequest)}
                >
                  {isDrink ? "Sí, descontar bebida" : "Confirmar y enviar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <EmployeeHistoryTabs
            activeTab={historyTab}
            movements={currentMovements}
            onTabChange={setHistoryTab}
            tickets={settlementTickets.data ?? []}
          />
        )}
      </div>

      {/* Floating dynamic bottom navigation */}
      <EmployeeBottomNav 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        style={{ transform: showNav ? "translateY(0)" : "translateY(100%)" }}
      />
    </main>
  )
}

function EmployeeBottomNav({
  activeTab,
  onTabChange,
  style
}: {
  activeTab: "home" | "request" | "history"
  onTabChange: (tab: "home" | "request" | "history") => void
  style?: React.CSSProperties
}) {
  const items = [
    { id: "home" as const, label: "Inicio", icon: LayoutDashboard },
    { id: "request" as const, label: "Solicitar", icon: Banknote },
    { id: "history" as const, label: "Historial", icon: ClipboardList }
  ]

  return (
    <nav className="employee-bottom-nav" style={style}>
      <div className="employee-bottom-nav-inner">
        {items.map((item) => {
          const active = activeTab === item.id
          return (
            <button
              key={item.id}
              className={`employee-bottom-nav-btn ${active ? "active" : ""}`}
              type="button"
              onClick={() => onTabChange(item.id)}
            >
              <item.icon />
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function EmployeeHistoryTabs({
  activeTab,
  movements,
  onTabChange,
  tickets
}: {
  activeTab: "current" | "settled"
  movements: Movement[]
  onTabChange: (tab: "current" | "settled") => void
  tickets: MovementSettlementTicket[]
}) {
  const tabs = [
    { id: "current" as const, label: "Movimientos", count: movements.length },
    { id: "settled" as const, label: "Liquidados", count: tickets.length }
  ]

  return (
    <div className="space-y-4">
      <div className="admin-card" style={{ background: 'rgba(13,17,23,0.8)' }}>
        <div className="admin-card-body space-y-3">
          <div className="flex rounded-2xl border border-white/10 bg-black/25 p-1">
            {tabs.map((tab) => {
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  className={`h-11 flex-1 rounded-xl border-none text-xs font-bold transition ${active ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground"}`}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                >
                  {tab.label}
                  <span className="ml-1 font-mono text-[10px] opacity-80">{tab.count}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {activeTab === "current" ? (
        <PortalMovementList title="Historial de Movimientos" movements={movements} />
      ) : (
        <PortalSettlementTicketList tickets={tickets} />
      )}
    </div>
  )
}

function PortalSettlementTicketList({ tickets }: { tickets: MovementSettlementTicket[] }) {
  return (
    <div className="space-y-4">
      <div className="section-title text-[0.875rem] font-bold uppercase tracking-wider text-muted-foreground mb-1">
        <ClipboardList style={{ width: 14, height: 14, color: '#00e5ff' }} />
        Historial de Periodos Liquidados
      </div>
      {!tickets.length && <StatusEmpty text="No hay periodos liquidados registrados aún." />}
      <div className="space-y-3.5">
        {tickets.map((ticket) => (
          <section key={ticket.id} className="employee-ticket-card">
            <div className="employee-ticket-header">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-accent">Recibo Digital</div>
                  <div className="mt-1 font-mono text-xs font-semibold text-foreground">{ticket.ticketNumber}</div>
                </div>
                <span className="badge-status badge-authorized" style={{ fontSize: '0.625rem' }}>Liquidado</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div>
                  <div className="text-[9px] uppercase tracking-wider">Periodo</div>
                  <div className="mt-0.5 font-semibold text-foreground">{formatTicketPeriod(ticket.from, ticket.to)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] uppercase tracking-wider">Fecha Liquidación</div>
                  <div className="mt-0.5 font-semibold text-foreground">{formatTicketDate(ticket.settledAt)}</div>
                </div>
              </div>
            </div>

            <div className="employee-ticket-body space-y-3">
              <div className="flex items-end justify-between gap-3 border-b border-dashed border-white/5 pb-2.5">
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Movimientos</div>
                  <div className="mt-0.5 font-mono text-lg font-bold text-foreground">{ticket.count}</div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Total Descontado</div>
                  <div className="mt-0.5 font-mono text-xl font-bold text-primary">{money.format(ticket.total)}</div>
                </div>
              </div>

              <div className="space-y-1.5">
                {ticket.byKind.map((item) => (
                  <div key={item.kind} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs">
                    <span className="min-w-0 truncate text-muted-foreground">{movementLabels[item.kind]}</span>
                    <span className="font-mono font-semibold text-foreground">{item.count} · {money.format(item.amount)}</span>
                  </div>
                ))}
                {!ticket.byKind.length && ticket.folios.length > 0 && (
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs text-muted-foreground text-center">
                    {ticket.folios.length} folio(s) liquidados
                  </div>
                )}
              </div>

              {ticket.movements.length > 0 && (
                <div className="space-y-2 border-t border-dashed border-white/10 pt-2.5">
                  {ticket.movements.map((movement) => (
                    <div key={movement.folio} className="grid grid-cols-[1fr_auto] gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-foreground">{movementLabels[movement.kind]}</div>
                        <div className="truncate font-mono text-[10px] text-muted-foreground">{movement.folio}</div>
                      </div>
                      <div className="font-mono font-bold text-foreground">{money.format(movement.amount)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function formatTicketPeriod(from?: string, to?: string) {
  if (!from && !to) return "Sin periodo"
  if (from && to) return `${formatTicketDate(from)} a ${formatTicketDate(to)}`
  return formatTicketDate(from ?? to ?? "")
}

function formatTicketDate(value?: string) {
  if (!value) return "Sin fecha"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
}

function PortalMovementList({
  title,
  movements,
  admin = false,
  compact = false
}: {
  title: string
  movements: Movement[]
  admin?: boolean
  compact?: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="section-title text-[0.875rem] font-bold uppercase tracking-wider text-muted-foreground mb-1">
        <ClipboardList style={{ width: 14, height: 14, color: '#00e5ff' }} />
        {title}
      </div>
      {!movements.length && <StatusEmpty text="Sin movimientos en el periodo actual." />}
      <div className={compact ? "space-y-1.5" : "space-y-2.5"}>
        {movements.map((movement) => {
          const statusClass = movement.status.toLowerCase()
          if (compact) {
            return (
              <div key={movement.id} className={`employee-movement-card compact status-${statusClass}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{movementLabels[movement.kind]}</div>
                    <div className="font-mono text-[9px] text-muted-foreground">{movement.folio}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs font-bold text-foreground">{money.format(Number(movement.amount))}</div>
                    <div className="text-[9px] text-muted-foreground">
                      {new Date(movement.createdAt).toLocaleString("es-MX", { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              </div>
            )
          }
          return (
            <div key={movement.id} className={`employee-movement-card status-${statusClass}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))' }}>{movement.folio}</div>
                  <div className="truncate text-sm font-semibold" style={{ color: 'hsl(var(--foreground))', marginTop: '2px' }}>{movementLabels[movement.kind]}</div>
                </div>
                <span className={getStatusBadgeClass(movement.status)}>{statusLabels[movement.status]}</span>
              </div>
              <div className="flex items-center justify-between gap-3 mt-1.5 text-xs text-muted-foreground">
                <span>{new Date(movement.createdAt).toLocaleString("es-MX", { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9rem', fontWeight: 700, color: 'hsl(var(--foreground))' }}>
                  {money.format(Number(movement.amount))}
                </span>
              </div>
              {movement.reason && (
                <div style={{ fontSize: '0.725rem', color: 'hsl(var(--muted-foreground))', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '4px' }}>
                  {movement.reason}
                </div>
              )}
              {admin && <span className="badge-status badge-discounted mt-2 w-fit">Administración</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatusText({ text }: { text: string }) {
  return <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">{text}</div>
}

function StatusEmpty({ text }: { text: string }) {
  return <div className="status-empty">{text}</div>
}

export default App
