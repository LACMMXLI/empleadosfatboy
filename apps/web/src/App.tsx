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
  UserRound,
  UserRoundPlus,
  UsersRound,
  X
} from "lucide-react"
import { api, employeeSession, session } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import type { Employee, Movement, MovementKind, MovementSettlementTicket, MovementStatus, Role, User } from "@/types/domain"
import { syncEmployeePwa } from "@/pwa/employeePwa"
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

const viewTitles: Record<View, string> = {
  dashboard: "Dashboard",
  empleados: "Empleados",
  pendientes: "Aprobaciones",
  adminMovements: "Movimientos Administrativos",
  historial: "Historial",
  configuracion: "Configuración"
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
  if (!data.reason || data.reason.trim().length === 0) {
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
  phone: z.string().min(10, "Teléfono a 10 dígitos requerido")
})
type EmployeeFormInput = z.infer<typeof employeeSchema>

const employeeEditSchema = z.object({
  fullName: z.string().min(3),
  pin: z.string().optional().refine((value) => !value || value.length === 6, "PIN a 6 dígitos"),
  position: z.string().min(2),
  phone: z.string().min(10, "Teléfono a 10 dígitos requerido")
})
type EmployeeEditFormInput = z.infer<typeof employeeEditSchema>

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

type View = "dashboard" | "empleados" | "pendientes" | "adminMovements" | "historial" | "configuracion"
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

function App() {
  const [tokenState, setTokenState] = useState(session.token)
  const [employeeTokenState, setEmployeeTokenState] = useState(employeeSession.token)
  const [activeView, setActiveView] = useState<View>("dashboard")
  const [route, setRoute] = useState<PortalRoute>(resolvePortalRoute())

  useEffect(() => {
    const onPopState = () => setRoute(resolvePortalRoute())
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  useEffect(() => {
    syncEmployeePwa(route === "employee")
  }, [route])

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
  const form = useForm({ defaultValues: { email: "admin@fatboy.local", password: "Admin123!" } })
  const login = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => api.login(email, password),
    onSuccess: (data) => {
      session.token = data.token
      employeeSession.token = null
      onLoggedIn(data.token)
    },
    onError: (err: Error) => setError(err.message)
  })

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
            <Button className="login-primary h-12 w-full" disabled={login.isPending}>
              Entrar a administración
            </Button>
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

  return (
    <LoginFrame variant="employee">
      <Card className="login-card w-full max-w-sm text-[#f7efe3]">
        <CardHeader className="space-y-3 p-5">
          <LoginLogo className="border-white/10" />
          <div>
            <CardTitle className="text-xl">Empleado</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Acceso con teléfono y código privado</p>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <form className="space-y-3" onSubmit={employeeForm.handleSubmit((values) => employeeLogin.mutate(values))}>
            <Input className="login-input h-12" placeholder="Teléfono" inputMode="tel" {...employeeForm.register("phone")} />
            <Input className="login-input h-12" placeholder="Código de 6 dígitos" type="password" inputMode="numeric" maxLength={6} {...employeeForm.register("pin")} />
            {employeeError && <div className="rounded-2xl border border-destructive/50 bg-destructive/10 p-3 text-sm">{employeeError}</div>}
            <Button className="login-primary h-12 w-full text-base" disabled={employeeLogin.isPending}>
              Entrar
            </Button>
            <Button className="h-11 w-full rounded-2xl" type="button" variant="ghost" onClick={() => goToPortal("home", () => window.location.reload())}>
              Volver
            </Button>
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
  const views = [
    { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
    { id: "empleados" as const, label: "Empleados", icon: UsersRound },
    { id: "pendientes" as const, label: "Aprobaciones", icon: ShieldCheck },
    { id: "adminMovements" as const, label: "Movimientos", icon: Building2 },
    { id: "historial" as const, label: "Historial", icon: ClipboardList },
    { id: "configuracion" as const, label: "Configuración", icon: Settings }
  ]

  return (
    <main className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 border-r bg-card/60 p-3 lg:block">
          <div className="mb-4 px-2">
            <div className="text-sm font-semibold">Fatboy POS</div>
              <div className="text-xs text-muted-foreground">Panel administrativo</div>
          </div>
          <nav className="space-y-1">
            {views.map((item) => (
              <Button
                key={item.id}
                variant={activeView === item.id ? "default" : "ghost"}
                className="w-full justify-start"
                onClick={() => onViewChange(item.id)}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Button>
            ))}
          </nav>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-card/95 p-3 backdrop-blur lg:static lg:bg-card/40">
            <div>
              <div className="text-[11px] font-medium uppercase text-muted-foreground lg:hidden">{viewTitles[activeView]}</div>
              <div className="text-sm font-semibold">{me.data?.fullName ?? "Usuario"}</div>
              <div className="text-xs text-muted-foreground">{me.data?.role ?? ""}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                session.token = null
                onLogout()
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </header>
          <div className="mobile-page flex-1 p-3 lg:p-4">
            {activeView === "dashboard" && <Dashboard />}
            {activeView === "empleados" && <Employees user={me.data} />}
            {activeView === "pendientes" && <PendingAuthorizations currentRole={me.data?.role} />}
            {activeView === "adminMovements" && <AdministrativeMovements user={me.data} />}
            {activeView === "historial" && <History />}
            {activeView === "configuracion" && <Configuration />}
          </div>
        </section>
      </div>
      <MobileBottomNav activeView={activeView} views={views} onViewChange={onViewChange} />
    </main>
  )
}

function MobileBottomNav({
  activeView,
  views,
  onViewChange
}: {
  activeView: View
  views: Array<{ id: View; label: string; icon: typeof LayoutDashboard }>
  onViewChange: (view: View) => void
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-2 shadow-2xl backdrop-blur lg:hidden">
      <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
        {views.map((item) => {
          const active = activeView === item.id
          return (
            <button
              key={item.id}
              className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition ${
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground active:bg-secondary"
              }`}
              onClick={() => onViewChange(item.id)}
              type="button"
            >
              <item.icon className="h-5 w-5" />
              <span className="max-w-full truncate">{item.label}</span>
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
  if (isLoading) return <StatusText text="Cargando dashboard" />
  if (error) return <StatusText text={(error as Error).message} />
  if (!data) return null

  const movements = periodMovements.data ?? []
  const pendingRequests = movements.filter((movement) => movement.origin === "EMPLOYEE_REQUEST" && movement.status === "PENDING").length
  const authorizedAdvances = movements
    .filter((movement) => movement.kind === "SALARY_ADVANCE" && movement.status === "AUTHORIZED")
    .reduce((total, movement) => total + Number(movement.amount), 0)
  const administrativeMovements = movements.filter((movement) => movement.origin === "ADMINISTRATIVE_ACTION").length
  const cards = [
    { label: "Solicitudes pendientes", value: String(periodMovements.data ? pendingRequests : data.cards.pendingMovements), tone: "primary" },
    { label: "Adelantos autorizados", value: money.format(authorizedAdvances), tone: "accent" },
    { label: "Movimientos administrativos del periodo", value: String(administrativeMovements), tone: "neutral" },
    { label: "Total por descontar", value: money.format(data.cards.pendingToDiscount), tone: "strong" }
  ]

  return (
    <div className="space-y-3">
      <div className="grid metric-grid gap-3">
        {cards.map((card) => (
          <Metric key={card.label} label={card.label} value={card.value} tone={card.tone} />
        ))}
      </div>
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="grid gap-3 p-4 text-sm md:grid-cols-4">
          <DetailLine label="Periodo" value={`Desde ${formatDateLabel(periodStart)}`} />
          <DetailLine label="Solicitudes totales" value={String(data.cards.pendingMovements)} />
          <DetailLine label="Autorizados activos" value={String(data.cards.authorizedMovements)} />
          <DetailLine label="Consulta" value={periodMovements.isLoading ? "Actualizando" : "Resumen administrativo"} />
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: string }) {
  const toneClass =
    tone === "primary"
      ? "border-primary/35 bg-primary/10"
      : tone === "accent"
        ? "border-accent/35 bg-accent/10"
        : tone === "strong"
          ? "border-emerald-500/30 bg-emerald-500/10"
          : "bg-card"

  return (
    <Card className={toneClass}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
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
    <section className="rounded-lg border bg-background/45 p-3">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {step}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          <div className="truncate text-xs text-muted-foreground">{detail}</div>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
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
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Movimientos Administrativos
          </CardTitle>
          <p className="text-sm text-muted-foreground">Formulario único para cargos, descuentos, consumos internos y correcciones autorizadas.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
            <GuidedBlock step="1" title="Empleado" detail="Selecciona a quien se aplicará el movimiento">
              <Select className="h-11" {...form.register("employeeId")}>
                <option value="">Seleccionar empleado</option>
                {employees.data?.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.phone} - {employee.fullName}
                  </option>
                ))}
              </Select>
            </GuidedBlock>
            <GuidedBlock step="2" title="Tipo y monto" detail="Registro administrativo directo, sin PIN de empleado">
              <div className="grid gap-3 sm:grid-cols-2">
                <Select className="h-11" {...form.register("kind")}>
                  {administrativeMovementKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {movementLabels[kind]}
                    </option>
                  ))}
                </Select>
                <Input className="h-11" type="number" step="0.01" placeholder="Monto" {...form.register("amount")} />
              </div>
            </GuidedBlock>
            <GuidedBlock step="3" title="Motivo y evidencia" detail="El motivo es obligatorio para auditoría">
              <Textarea placeholder="Motivo obligatorio" {...form.register("reason")} />
              <Textarea placeholder="Evidencia si aplica / referencia / nota administrativa" {...form.register("evidenceNote")} />
            </GuidedBlock>
            <GuidedBlock step="4" title="Autorización administrativa" detail="El backend registra el usuario responsable">
              <div className="rounded-md border bg-background/45 p-3 text-sm">
                <div className="text-[11px] uppercase text-muted-foreground">Responsable</div>
                <div className="mt-1 font-medium">{user?.fullName ?? "Usuario administrativo"}</div>
              </div>
            </GuidedBlock>
            <Button className="h-12 w-full text-base" disabled={mutation.isPending}>
              Registrar movimiento administrativo
            </Button>
            {message && <div className="rounded-md border p-2 text-sm text-muted-foreground">{message}</div>}
          </form>
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Liquidar por empleado
          </CardTitle>
          <p className="text-sm text-muted-foreground">Marca como pagado un rango ya cubierto para que deje de sumar al saldo pendiente.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(130px,0.55fr)_minmax(130px,0.55fr)]">
            <Select
              className="h-11 min-w-0"
              value={settlementEmployeeId}
              onChange={(event) => {
                setSettlementEmployeeId(event.target.value)
                setSettlementMessage(null)
              }}
            >
              <option value="">Seleccionar empleado</option>
              {employees.data?.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.phone} - {employee.fullName}
                </option>
              ))}
            </Select>
            <Input
              className="h-11 min-w-0"
              type="date"
              value={settlementFrom}
              onChange={(event) => {
                setSettlementFrom(event.target.value)
                setSettlementMessage(null)
              }}
            />
            <Input
              className="h-11 min-w-0"
              type="date"
              value={settlementTo}
              onChange={(event) => {
                setSettlementTo(event.target.value)
                setSettlementMessage(null)
              }}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-primary/30 bg-primary/10 p-3">
              <div className="text-[11px] uppercase text-muted-foreground">Empleado</div>
              <div className="mt-1 truncate text-sm font-semibold">{selectedSettlementEmployee?.fullName ?? "Sin seleccionar"}</div>
            </div>
            <div className="rounded-md border border-accent/30 bg-accent/10 p-3">
              <div className="text-[11px] uppercase text-muted-foreground">Total</div>
              <div className="mt-1 font-mono text-xl font-semibold">{money.format(settlementSummary.data?.total ?? 0)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-[11px] uppercase text-muted-foreground">Movimientos</div>
              <div className="mt-1 font-mono text-xl font-semibold">{settlementSummary.data?.count ?? 0}</div>
            </div>
          </div>

          <div className="space-y-2">
            {(settlementSummary.data?.byKind ?? []).map((item) => (
              <div key={item.kind} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background/45 p-3 text-sm">
                <span className="min-w-0 truncate">{movementLabels[item.kind]}</span>
                <span className="font-mono">{item.count} · {money.format(item.amount)}</span>
              </div>
            ))}
            {settlementEmployeeId && !settlementSummary.isLoading && !settlementSummary.data?.count && (
              <StatusText text="No hay movimientos autorizados por liquidar en este filtro." />
            )}
          </div>

          <Button className="h-12 w-full text-base" disabled={!canSettle} onClick={() => settle.mutate()}>
            Marcar rango como liquidado
          </Button>
          {settlementMessage && <div className="rounded-md border p-2 text-sm text-muted-foreground">{settlementMessage}</div>}
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            Responsable: <span className="text-foreground">{user?.fullName}</span>
          </div>
        </CardContent>
      </Card>
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aprobaciones</CardTitle>
        <p className="text-sm text-muted-foreground">Solicitudes pendientes listas para aprobar o rechazar.</p>
      </CardHeader>
      <CardContent>
        {!pending.data?.length && <StatusText text="No hay movimientos pendientes." />}
        <div className="space-y-3">
          {pending.data?.map((movement) => {
            return (
              <div key={movement.id} className="rounded-lg border bg-background/45 p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[1.1fr_0.8fr_0.7fr_1.4fr_1fr]">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase text-muted-foreground">Empleado</div>
                      <div className="truncate font-semibold">{movement.employee?.fullName ?? "Empleado"}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{movement.folio}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground">Fecha</div>
                      <div className="text-sm">{new Date(movement.createdAt).toLocaleString("es-MX")}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground">Monto solicitado</div>
                      <div className="font-mono text-sm font-semibold">{money.format(Number(movement.amount))}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase text-muted-foreground">Motivo</div>
                      <div className="text-sm text-muted-foreground">{movement.reason}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase text-muted-foreground">Evidencia</div>
                      <div className="text-sm text-muted-foreground">{movement.evidenceNote || "Sin evidencia"}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canProcess && (
                      <>
                        <Button size="sm" onClick={() => authorize.mutate(movement.id)} disabled={authorize.isPending}>
                          Autorizar
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => reject.mutate(movement.id)} disabled={reject.isPending}>
                          Rechazar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className="break-words">{value}</div>
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

function History() {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial</CardTitle>
        <p className="text-sm text-muted-foreground">Consulta y auditoría de solicitudes y movimientos administrativos.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-5">
          <Select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
            <option value="">Empleado</option>
            {employees.data?.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName}
              </option>
            ))}
          </Select>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          <Select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="">Tipo</option>
            {Object.entries(movementLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Estado</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <MovementTable movements={movements.data ?? []} />
      </CardContent>
    </Card>
  )
}

function MovementTable({
  movements,
  actions
}: {
  movements: Movement[]
  actions?: (movement: Movement) => React.ReactNode
}) {
  if (!movements.length) return <StatusText text="Sin movimientos" />

  return (
    <>
      <div className="space-y-2 md:hidden">
        {movements.map((movement) => (
          <div key={movement.id} className="rounded-lg border bg-background/45 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{movement.employee?.fullName ?? "Empleado"}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{movement.folio}</div>
              </div>
              <Badge>{statusLabels[movement.status]}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-[11px] text-muted-foreground">Tipo</div>
                <div>{movementLabels[movement.kind]}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-muted-foreground">Cantidad</div>
                <div className="font-semibold">{money.format(Number(movement.amount))}</div>
              </div>
            </div>
            <div className="mt-3 rounded-md border bg-background/45 p-2 text-xs">{movementEventLabel(movement)}</div>
            <div className="mt-3 text-xs text-muted-foreground">{new Date(movement.createdAt).toLocaleString("es-MX")}</div>
            {actions?.(movement) && <div className="mt-3">{actions(movement)}</div>}
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[780px] text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 pr-3">Folio</th>
            <th className="py-2 pr-3">Empleado</th>
            <th className="py-2 pr-3">Tipo</th>
            <th className="py-2 pr-3">Cantidad</th>
            <th className="py-2 pr-3">Estado</th>
            <th className="py-2 pr-3">Evento</th>
            <th className="py-2 pr-3">Registro</th>
            <th className="py-2 pr-3">Accion</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((movement) => (
            <tr key={movement.id} className="border-b last:border-0">
              <td className="py-2 pr-3 font-mono text-xs">{movement.folio}</td>
              <td className="py-2 pr-3">{movement.employee?.fullName ?? "Empleado"}</td>
              <td className="py-2 pr-3">
                <div>{movementLabels[movement.kind]}</div>
                <div className="text-[11px] text-muted-foreground">
                  {movement.origin === "EMPLOYEE_REQUEST" ? "Solicitud empleado" : "Movimiento administrativo"}
                </div>
              </td>
              <td className="py-2 pr-3">{money.format(Number(movement.amount))}</td>
              <td className="py-2 pr-3">
                <Badge>{statusLabels[movement.status]}</Badge>
              </td>
              <td className="py-2 pr-3">{movementEventLabel(movement)}</td>
              <td className="py-2 pr-3 text-muted-foreground">{new Date(movement.createdAt).toLocaleString("es-MX")}</td>
              <td className="py-2 pr-3">{actions?.(movement)}</td>
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
  const selectedEmployee = employees.data?.find((employee) => employee.id === selectedEmployeeId)
  const form = useForm<EmployeeFormInput>({ resolver: zodResolver(employeeSchema) })
  const editForm = useForm<EmployeeEditFormInput>({
    resolver: zodResolver(employeeEditSchema),
    defaultValues: { fullName: "", position: "", phone: "", pin: "" }
  })
  const create = useMutation({
    mutationFn: (payload: EmployeeFormInput) =>
      api.createEmployee({ ...payload, branchId: user?.branch?.id }),
    onSuccess: async () => {
      form.reset()
      await queryClient.invalidateQueries({ queryKey: ["employees"] })
    }
  })
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EmployeeEditFormInput }) =>
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
      pin: ""
    })
  }, [editForm, selectedEmployee])

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRoundPlus className="h-4 w-4" />
            Alta de empleado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={form.handleSubmit((values) => create.mutate(values))}>
            <Input placeholder="Nombre completo" {...form.register("fullName")} />
            <Input placeholder="Puesto" {...form.register("position")} />
            <Input placeholder="Telefono" {...form.register("phone")} />
            <Input type="password" placeholder="PIN" {...form.register("pin")} />
            <Button className="w-full" disabled={create.isPending || !user?.branch?.id}>
              Crear
            </Button>
            {create.error && <div className="rounded-md border p-2 text-sm">{create.error.message}</div>}
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Edición y PIN
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedEmployee && <StatusText text="Selecciona un empleado del directorio para editarlo." />}
          {selectedEmployee && (
            <form
              className="space-y-3"
              onSubmit={editForm.handleSubmit((values) => update.mutate({ id: selectedEmployee.id, payload: values }))}
            >
              <Input placeholder="Nombre completo" {...editForm.register("fullName")} />
              <Input placeholder="Puesto" {...editForm.register("position")} />
              <Input placeholder="Telefono" {...editForm.register("phone")} />
              <Input type="password" placeholder="Nuevo PIN opcional" {...editForm.register("pin")} />
              <div className="grid grid-cols-2 gap-2">
                <Button className="w-full" disabled={update.isPending}>
                  Guardar
                </Button>
                <Button
                  className="w-full"
                  type="button"
                  variant={selectedEmployee.active ? "destructive" : "secondary"}
                  disabled={toggleActive.isPending}
                  onClick={() => toggleActive.mutate(selectedEmployee)}
                >
                  {selectedEmployee.active ? "Desactivar" : "Activar"}
                </Button>
              </div>
              {update.error && <div className="rounded-md border p-2 text-sm">{update.error.message}</div>}
              {toggleActive.error && <div className="rounded-md border p-2 text-sm">{toggleActive.error.message}</div>}
            </form>
          )}
        </CardContent>
      </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Lista de empleados</CardTitle>
          <p className="text-sm text-muted-foreground">Información básica, estado y acceso rápido a edición.</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {employees.data?.map((employee: Employee) => (
              <button
                key={employee.id}
                className={`rounded-md border p-3 text-left transition hover:bg-secondary/60 ${
                  selectedEmployeeId === employee.id ? "border-primary bg-primary/10" : "bg-background/45"
                }`}
                type="button"
                onClick={() => setSelectedEmployeeId(employee.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 font-medium">{employee.fullName}</div>
                  <Badge className={employee.active ? "border-emerald-500/40 text-emerald-400" : "border-destructive/50 text-destructive"}>
                    {employee.active ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">{employee.phone} · {employee.position}</div>
                <div className="mt-2 text-xs text-muted-foreground">{employee.branch.name}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Configuration() {
  const queryClient = useQueryClient()
  const configuration = useQuery({ queryKey: ["configuration"], queryFn: api.configuration })
  const rules = useQuery({ queryKey: ["rules"], queryFn: api.rules })
  const configForm = useForm<ConfigFormInput, unknown, ConfigFormOutput>({
    resolver: zodResolver(configSchema),
    defaultValues: { beveragePrice: 30 }
  })
  const form = useForm<RuleFormInput, unknown, RuleFormOutput>({
    resolver: zodResolver(ruleSchema),
    defaultValues: { requiredRole: "ENCARGADO", minAmount: 0 }
  })
  useEffect(() => {
    if (configuration.data) {
      configForm.reset({ beveragePrice: Number(configuration.data.beveragePrice ?? 30) })
    }
  }, [configForm, configuration.data])
  const updateConfig = useMutation({
    mutationFn: (values: ConfigFormOutput) => api.updateConfiguration({ beveragePrice: values.beveragePrice }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["configuration"] })
  })
  const createRule = useMutation({
    mutationFn: (values: RuleFormOutput) =>
      api.createRule({ ...values, kind: values.kind || undefined, maxAmount: values.maxAmount || undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rules"] })
  })

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Precio de bebida
            </CardTitle>
            <p className="text-sm text-muted-foreground">Este monto se aplica automaticamente al solicitar bebida.</p>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={configForm.handleSubmit((values) => updateConfig.mutate(values))}>
              <Input type="number" step="0.01" placeholder="Precio" {...configForm.register("beveragePrice")} />
              <Button className="w-full" disabled={updateConfig.isPending}>
                Guardar precio
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Nueva regla
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={form.handleSubmit((values) => createRule.mutate(values))}>
              <Select {...form.register("kind")}>
                <option value="">Todos los tipos</option>
                {Object.entries(movementLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" step="0.01" placeholder="Desde" {...form.register("minAmount")} />
                <Input type="number" step="0.01" placeholder="Hasta" {...form.register("maxAmount")} />
              </div>
              <Select {...form.register("requiredRole")}>
                {["ENCARGADO", "GERENTE", "ADMINISTRADOR"].map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </Select>
              <Button className="w-full">Guardar regla</Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Reglas activas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {rules.data?.map((rule) => (
              <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <span>{rule.kind ? movementLabels[rule.kind as MovementKind] : "Todos"}</span>
                <span>{money.format(Number(rule.minAmount))} - {rule.maxAmount ? money.format(Number(rule.maxAmount)) : "sin limite"}</span>
                <Badge>{rule.requiredRole}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function EmployeePortal({ onLogout }: { onLogout: () => void }) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<"home" | "request" | "history">("home")
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
    if (!payload.reason?.trim()) {
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
  const recentMovements = (movements.data ?? []).filter((movement) => movement.status !== "DISCOUNTED").slice(0, 4)
  return (
    <main className="min-h-screen bg-[#080a0f] text-[#f7efe3]">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-[#080a0f]/90 p-4 backdrop-blur-xl">
        <div>
          <div className="text-[11px] font-medium uppercase text-primary/80">Mi cuenta</div>
          <div className="text-base font-semibold">{me.data?.fullName ?? "Empleado"}</div>
        </div>
        <Button
          variant="secondary"
          size="icon"
          className="h-11 w-11 rounded-full border border-white/10 bg-white/[0.08] text-[#f7efe3] hover:bg-white/[0.12]"
          onClick={() => {
            setCodeMessage(null)
            setAccountOpen(true)
          }}
          aria-label="Abrir cuenta"
        >
          <UserRound className="h-5 w-5" />
        </Button>
      </header>
      {accountOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" onClick={() => setAccountOpen(false)}>
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#10151d] p-4 shadow-2xl shadow-black/40" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UserRound className="h-6 w-6" />
                </div>
                <div className="mt-3 truncate text-lg font-semibold">{me.data?.fullName ?? "Empleado"}</div>
                <div className="text-sm text-muted-foreground">{me.data?.position ?? "Puesto"}</div>
              </div>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-white/10" onClick={() => setAccountOpen(false)} aria-label="Cerrar">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <form className="mt-5 space-y-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4" onSubmit={codeForm.handleSubmit((values) => changeCode.mutate(values))}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <KeyRound className="h-4 w-4 text-primary" />
                Cambiar código privado
              </div>
              <Input className="h-12 rounded-2xl border-white/10 bg-black/20" placeholder="Código actual" type="password" inputMode="numeric" maxLength={6} {...codeForm.register("currentCode")} />
              <Input className="h-12 rounded-2xl border-white/10 bg-black/20" placeholder="Nuevo código" type="password" inputMode="numeric" maxLength={6} {...codeForm.register("newCode")} />
              <Button className="h-12 w-full rounded-2xl border border-white/10 bg-white/10 hover:bg-white/15" variant="secondary" disabled={changeCode.isPending}>
                Actualizar código
              </Button>
              {codeMessage && <div className="text-sm text-muted-foreground">{codeMessage}</div>}
            </form>

            <Button
              className="mt-3 h-12 w-full rounded-2xl hover:bg-white/10"
              variant="ghost"
              onClick={() => {
                employeeSession.token = null
                setAccountOpen(false)
                onLogout()
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesión
            </Button>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-md space-y-4 p-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        {activeTab === "home" && (
          <>
            <section className="rounded-3xl border border-white/10 bg-[#10151d] p-5 shadow-2xl shadow-black/20">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-2xl font-semibold">{me.data?.fullName ?? "Empleado"}</div>
                  <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <UserRound className="h-4 w-4 text-primary" />
                    {me.data?.position ?? "Puesto"}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="h-4 w-4 text-accent" />
                    {me.data?.branch?.name ?? "Sucursal"}
                  </div>
                </div>
                <div className="rounded-full border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">Activo</div>
              </div>
            </section>

            <section className="rounded-3xl border border-primary/20 bg-[#18130d] p-5 shadow-2xl shadow-primary/5">
              <div className="flex items-center gap-2 text-sm text-primary/80">
                <Banknote className="h-4 w-4" />
                Saldo pendiente
              </div>
              <div className="mt-3 font-mono text-4xl font-semibold">{money.format(balance.data?.pendingBalance ?? 0)}</div>
            </section>

            <img
              className="pointer-events-none mx-auto -my-2 h-28 w-full max-w-sm object-contain opacity-85 drop-shadow-[0_18px_30px_rgba(0,0,0,0.35)]"
              src={fatboyLogo}
              alt=""
              aria-hidden="true"
            />

            {recentMovements.length > 0 && <PortalMovementList title="Recientes" movements={recentMovements} />}
          </>
        )}

        {activeTab === "request" && (
          <Card className="rounded-3xl border-white/10 bg-[#10151d] shadow-2xl shadow-black/20">
            <CardHeader>
              <CardTitle>Solicitar</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-3"
                noValidate
                onSubmit={form.handleSubmit(prepareRequestConfirmation, handleInvalidRequest)}
              >
                <GuidedBlock step="1" title="Tipo" detail="Selecciona una opción">
                  <Select className="h-12 rounded-2xl border-white/10 bg-black/20" {...form.register("kind")} onChange={(event) => {
                    form.setValue("kind", event.target.value as EmployeeRequestFormInput["kind"])
                    setConfirming(false)
                    setRequestError(null)
                  }}>
                    {employeeRequestKinds.map((kind) => (
                      <option key={kind} value={kind}>
                        {movementLabels[kind]}
                      </option>
                    ))}
                  </Select>
                </GuidedBlock>
                <GuidedBlock step="2" title={isDrink ? "Bebida" : "Monto"} detail={isDrink ? "Precio configurado por administración" : "Captura la cantidad"}>
                  {isDrink ? (
                    <div className="flex h-12 items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 text-sm">
                      <span className="text-muted-foreground">Precio</span>
                      <span className="font-mono text-lg font-semibold">{money.format(beveragePrice)}</span>
                    </div>
                  ) : (
                    <Input
                      className="h-12 rounded-2xl border-white/10 bg-black/20"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="Monto"
                      {...form.register("amount", {
                        onChange: () => {
                          setConfirming(false)
                          setRequestError(null)
                        }
                      })}
                    />
                  )}
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">
                    <span className="text-muted-foreground">Monto capturado</span>
                    <span className="font-mono text-base font-semibold text-primary">{money.format(Number.isFinite(requestAmount) ? requestAmount : 0)}</span>
                  </div>
                </GuidedBlock>
                <GuidedBlock step="3" title="Motivo" detail="Describe brevemente la razón">
                  <div className="flex flex-wrap gap-2">
                    {quickRequestReasons.map((reason) => (
                      <button
                        key={reason}
                        className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition active:bg-primary/20"
                        type="button"
                        onClick={() => appendQuickReason(reason)}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  <Textarea
                    className="rounded-2xl border-white/10 bg-black/20"
                    placeholder="Motivo"
                    {...form.register("reason", {
                      onChange: () => {
                        setConfirming(false)
                        setRequestError(null)
                      }
                    })}
                  />
                </GuidedBlock>
                {requestError && <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm">{requestError}</div>}
                <Button className="h-12 w-full rounded-2xl text-base shadow-lg shadow-primary/10" disabled={create.isPending}>
                  Continuar
                </Button>
                <p className="px-1 text-center text-xs text-muted-foreground">Las solicitudes quedan sujetas a revisión y autorización administrativa.</p>
                {message && <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm text-muted-foreground">{message}</div>}
              </form>
            </CardContent>
          </Card>
        )}
        {confirming && activeTab === "request" && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" onClick={() => setConfirming(false)}>
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#10151d] p-4 shadow-2xl shadow-black/40" onClick={(event) => event.stopPropagation()}>
              <div className="space-y-1">
                <div className="text-lg font-semibold">Confirmar solicitud</div>
                <p className="text-sm text-muted-foreground">Revisa los datos antes de enviar tu solicitud.</p>
              </div>
              <div className="mt-4 space-y-2 rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm">
                <DetailLine label="Tipo de solicitud" value={movementLabels[values.kind as MovementKind]} />
                <DetailLine label="Monto" value={money.format(Number.isFinite(requestAmount) ? requestAmount : 0)} />
                <DetailLine label="Motivo" value={requestReason || "Sin motivo"} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button className="h-12 rounded-2xl hover:bg-white/10" type="button" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancelar
                </Button>
                <Button
                  className="h-12 rounded-2xl"
                  type="button"
                  disabled={create.isPending}
                  onClick={form.handleSubmit((payload) => {
                    setRequestError(null)
                    create.mutate(payload)
                  }, handleInvalidRequest)}
                >
                  Confirmar solicitud
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <PortalSettlementTicketList tickets={settlementTickets.data ?? []} />
        )}
      </div>
      <EmployeeBottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </main>
  )
}

function EmployeeBottomNav({
  activeTab,
  onTabChange
}: {
  activeTab: "home" | "request" | "history"
  onTabChange: (tab: "home" | "request" | "history") => void
}) {
  const items = [
    { id: "home" as const, label: "Inicio", icon: LayoutDashboard },
    { id: "request" as const, label: "Solicitar", icon: Banknote },
    { id: "history" as const, label: "Historial", icon: ClipboardList }
  ]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#080a0f]/90 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 shadow-2xl shadow-black/50 backdrop-blur-xl">
      <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
        {items.map((item) => {
          const active = activeTab === item.id
          return (
            <button
              key={item.id}
              className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold transition ${
                active ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground active:bg-white/10"
              }`}
              type="button"
              onClick={() => onTabChange(item.id)}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function PortalSettlementTicketList({ tickets }: { tickets: MovementSettlementTicket[] }) {
  return (
    <Card className="rounded-3xl border-white/10 bg-[#10151d] shadow-2xl shadow-black/20">
      <CardHeader>
        <CardTitle>Tickets de descuento</CardTitle>
        <p className="text-sm text-muted-foreground">Comprobantes digitales de periodos ya liquidados.</p>
      </CardHeader>
      <CardContent>
        {!tickets.length && <StatusText text="Sin tickets de descuento" />}
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <section key={ticket.id} className="overflow-hidden rounded-3xl border border-primary/25 bg-[#0d1118]">
              <div className="border-b border-dashed border-white/15 bg-primary/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase text-primary/80">Ticket de descuento</div>
                    <div className="mt-1 truncate font-mono text-sm font-semibold">{ticket.ticketNumber}</div>
                  </div>
                  <Badge className="border-primary/40 bg-primary/10 text-primary">Liquidado</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[11px] uppercase text-muted-foreground">Periodo</div>
                    <div className="mt-1 font-medium">{formatTicketPeriod(ticket.from, ticket.to)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase text-muted-foreground">Fecha</div>
                    <div className="mt-1 font-medium">{formatTicketDate(ticket.settledAt)}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 p-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase text-muted-foreground">Movimientos</div>
                    <div className="mt-1 font-mono text-xl font-semibold">{ticket.count}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase text-muted-foreground">Total descontado</div>
                    <div className="mt-1 font-mono text-2xl font-semibold text-primary">{money.format(ticket.total)}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  {ticket.byKind.map((item) => (
                    <div key={item.kind} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">{movementLabels[item.kind]}</span>
                      <span className="font-mono">{item.count} · {money.format(item.amount)}</span>
                    </div>
                  ))}
                  {!ticket.byKind.length && ticket.folios.length > 0 && (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-muted-foreground">
                      {ticket.folios.length} folio(s) liquidados
                    </div>
                  )}
                </div>

                {ticket.movements.length > 0 && (
                  <div className="space-y-2 border-t border-dashed border-white/15 pt-3">
                    {ticket.movements.map((movement) => (
                      <div key={movement.folio} className="grid grid-cols-[1fr_auto] gap-3 text-sm">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{movementLabels[movement.kind]}</div>
                          <div className="truncate font-mono text-[11px] text-muted-foreground">{movement.folio}</div>
                        </div>
                        <div className="font-mono font-semibold">{money.format(movement.amount)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </CardContent>
    </Card>
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

function PortalMovementList({ title, movements, admin = false }: { title: string; movements: Movement[]; admin?: boolean }) {
  return (
    <Card className="rounded-3xl border-white/10 bg-[#10151d] shadow-2xl shadow-black/20">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {!movements.length && <StatusText text="Sin movimientos" />}
        <div className="space-y-2">
          {movements.map((movement) => (
            <div key={movement.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-[11px] text-muted-foreground">{movement.folio}</div>
                  <div className="truncate text-sm font-semibold">{movementLabels[movement.kind]}</div>
                </div>
                <Badge className="border-white/10 bg-black/15">{statusLabels[movement.status]}</Badge>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{new Date(movement.createdAt).toLocaleString("es-MX")}</span>
                <span className="font-mono font-semibold">{money.format(Number(movement.amount))}</span>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">{movement.reason}</div>
              {admin && <Badge className="mt-3 border-primary/50 text-primary">Administración</Badge>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function StatusText({ text }: { text: string }) {
  return <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">{text}</div>
}

export default App
