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
  Circle,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  UserRoundPlus,
  UsersRound,
  X
} from "lucide-react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { api, employeeSession, session } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import type { DashboardSummary, Employee, Movement, MovementKind, MovementStatus, Role, User } from "@/types/domain"
import { syncEmployeePwa } from "@/pwa/employeePwa"
import fatboyLogo from "@/assets/logo.png"

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" })

const movementLabels: Record<MovementKind, string> = {
  SALARY_ADVANCE: "Adelanto",
  LOAN: "Prestamo",
  INTERNAL_CONSUMPTION: "Consumo",
  DRINK: "Bebida",
  FOOD: "Comida",
  CASH_OUT: "Salida efectivo",
  ADMIN_ADJUSTMENT: "Ajuste",
  ADMIN_CHARGE: "Cargo admin",
  SHORTAGE_DISCOUNT: "Faltante",
  DAMAGE_DISCOUNT: "Daño",
  BALANCE_CORRECTION: "Corrección",
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
  dashboard: "Resumen",
  registro: "Registrar",
  pendientes: "Pendientes",
  adminMovements: "Admin",
  historial: "Historial",
  empleados: "Empleados",
  configuracion: "Config"
}

const movementSchema = z.object({
  employeeId: z.string().min(1, "Selecciona empleado"),
  kind: z.enum(["SALARY_ADVANCE", "DRINK", "INTERNAL_CONSUMPTION"]),
  amount: z.coerce.number().positive("Cantidad invalida"),
  reason: z.string().optional(),
  employeePin: z.string().length(6, "Código de 6 dígitos requerido"),
  productName: z.string().optional(),
  quantity: z.coerce.number().optional(),
  unitPrice: z.coerce.number().optional(),
  evidenceNote: z.string().optional()
}).superRefine((data, ctx) => {
  if (data.kind !== "DRINK" && (!data.reason || data.reason.trim().length < 3)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Motivo requerido",
      path: ["reason"]
    })
  }
})
type MovementFormInput = z.input<typeof movementSchema>
type MovementFormOutput = z.output<typeof movementSchema>

const adminMovementSchema = z.object({
  employeeId: z.string().min(1, "Selecciona empleado"),
  kind: z.enum([
    "ADMIN_ADJUSTMENT",
    "ADMIN_CHARGE",
    "SHORTAGE_DISCOUNT",
    "DAMAGE_DISCOUNT",
    "CASH_OUT",
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
  amount: z.coerce.number().positive("Cantidad invalida"),
  reason: z.string().optional(),
  productName: z.string().optional(),
  quantity: z.coerce.number().optional(),
  unitPrice: z.coerce.number().optional()
}).superRefine((data, ctx) => {
  if (data.kind !== "DRINK" && (!data.reason || data.reason.trim().length < 3)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Motivo requerido",
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

type View = "dashboard" | "registro" | "pendientes" | "adminMovements" | "historial" | "empleados" | "configuracion"
type PortalRoute = "home" | "admin" | "employee"

const standardMovementKinds: MovementKind[] = ["SALARY_ADVANCE", "DRINK", "INTERNAL_CONSUMPTION"]
const employeeRequestKinds: MovementKind[] = standardMovementKinds
const administrativeMovementKinds: MovementKind[] = [
  "ADMIN_ADJUSTMENT",
  "ADMIN_CHARGE",
  "SHORTAGE_DISCOUNT",
  "DAMAGE_DISCOUNT",
  "CASH_OUT",
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
    { id: "registro" as const, label: "Registro", icon: Banknote },
    { id: "pendientes" as const, label: "Pendientes", icon: ShieldCheck },
    { id: "adminMovements" as const, label: "Admin", icon: Building2 },
    { id: "historial" as const, label: "Historial", icon: ClipboardList },
    { id: "empleados" as const, label: "Empleados", icon: UsersRound },
    { id: "configuracion" as const, label: "Config", icon: Settings }
  ]

  return (
    <main className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        <aside className="hidden w-60 border-r bg-card/60 p-3 lg:block">
          <div className="mb-4 px-2">
            <div className="text-sm font-semibold">Fatboy POS</div>
            <div className="text-xs text-muted-foreground">Control empleados</div>
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
            {activeView === "registro" && <MovementRegister user={me.data} />}
            {activeView === "pendientes" && <PendingAuthorizations currentRole={me.data?.role} />}
            {activeView === "adminMovements" && <AdministrativeMovements user={me.data} />}
            {activeView === "historial" && <History />}
            {activeView === "empleados" && <Employees user={me.data} />}
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
      <div className="grid grid-cols-7 gap-1">
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
  if (isLoading) return <StatusText text="Cargando dashboard" />
  if (error) return <StatusText text={(error as Error).message} />
  if (!data) return null

  const cards = [
    ["Adelantos hoy", data.cards.advancesToday],
    ["Consumos hoy", data.cards.consumptionsToday],
    ["Salidas hoy", data.cards.cashOutToday],
    ["Por descontar", data.cards.pendingToDiscount],
    ["Pendientes", data.cards.pendingMovements],
    ["Autorizados", data.cards.authorizedMovements]
  ]

  return (
    <div className="space-y-4">
      <div className="grid metric-grid gap-3">
        {cards.map(([label, value]) => (
          <Metric key={label} label={String(label)} value={typeof value === "number" && label !== "Pendientes" && label !== "Autorizados" ? money.format(value) : String(value)} />
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Adelantos recientes</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <Chart data={data} />
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  )
}

function Chart({ data }: { data: DashboardSummary }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data.weeklyAdvances}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
        <Area dataKey="amount" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.22)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function MovementRegister({ user }: { user?: User }) {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const employees = useQuery({ queryKey: ["employees"], queryFn: () => api.employees() })
  const config = useQuery({ queryKey: ["configuration"], queryFn: api.configuration })
  const form = useForm<MovementFormInput, unknown, MovementFormOutput>({
    resolver: zodResolver(movementSchema),
    defaultValues: {
      kind: "SALARY_ADVANCE",
      amount: 0,
      reason: "",
      employeePin: ""
    }
  })
  const mutation = useMutation({
    mutationFn: (payload: MovementFormOutput) => api.createMovement(payload),
    onSuccess: async (movement) => {
      setMessage(`Movimiento ${movement.folio} registrado como pendiente`)
      form.reset({ kind: "SALARY_ADVANCE", amount: 0, reason: "", employeePin: "" })
      await queryClient.invalidateQueries()
    },
    onError: (err: Error) => setMessage(err.message)
  })
  const selectedEmployeeId = form.watch("employeeId")
  const selectedKind = form.watch("kind")
  const amount = Number(form.watch("amount") || 0)
  const selectedEmployee = employees.data?.find((employee) => employee.id === selectedEmployeeId)
  const beveragePrice = Number(config.data?.beveragePrice ?? 30)
  const isDrink = selectedKind === "DRINK"

  useEffect(() => {
    if (selectedKind === "DRINK") {
      form.setValue("amount", beveragePrice)
      form.setValue("productName", "Bebida")
      form.setValue("quantity", 1)
      form.setValue("unitPrice", beveragePrice)
    }
  }, [beveragePrice, form, selectedKind])

  const guideSteps = [
    { label: "Empleado", done: Boolean(selectedEmployeeId) },
    { label: "Monto", done: amount > 0 },
    { label: "Motivo", done: Boolean(form.watch("reason")) },
    { label: "PIN", done: Boolean(form.watch("employeePin")) }
  ]

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Nuevo movimiento</CardTitle>
          <div className="grid grid-cols-4 gap-2 pt-2 md:hidden">
            {guideSteps.map((step) => (
              <div
                key={step.label}
                className={`flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-[11px] ${
                  step.done ? "border-primary/60 bg-primary/15 text-foreground" : "text-muted-foreground"
                }`}
              >
                {step.done ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <Circle className="h-3.5 w-3.5" />}
                <span className="truncate">{step.label}</span>
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
            <GuidedBlock step="1" title="Empleado" detail={selectedEmployee ? `${selectedEmployee.phone} · ${selectedEmployee.position}` : "Busca y confirma a quien se le registra"}>
              <Select className="h-11" {...form.register("employeeId")}>
                <option value="">Seleccionar empleado</option>
                {employees.data?.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.phone} - {employee.fullName}
                  </option>
                ))}
              </Select>
            </GuidedBlock>

            <GuidedBlock step="2" title="Movimiento" detail="El backend validara autorizacion y saldo">
              <div className="grid gap-3 sm:grid-cols-2">
                <Select className="h-11" {...form.register("kind")}>
                  {standardMovementKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {movementLabels[kind]}
                    </option>
                  ))}
                </Select>
                {isDrink ? (
                  <div className="flex h-11 items-center rounded-md border bg-background px-3 text-sm font-semibold">
                    {money.format(beveragePrice)}
                  </div>
                ) : (
                  <Input className="h-11" type="number" step="0.01" placeholder="Cantidad" {...form.register("amount")} />
                )}
              </div>
            </GuidedBlock>

            <GuidedBlock step="3" title="Motivo y evidencia" detail="Deja contexto suficiente para auditoria">
              <Textarea placeholder="Motivo" {...form.register("reason")} />
              <Textarea placeholder="Evidencia / autorizacion verbal / referencia" {...form.register("evidenceNote")} />
            </GuidedBlock>

            <GuidedBlock step="4" title="Confirmacion" detail="El PIN confirma que el empleado reconoce el movimiento">
              <Input className="h-11 text-center text-lg tracking-[0.35em]" type="password" inputMode="numeric" placeholder="PIN" {...form.register("employeePin")} />
            </GuidedBlock>

            <div className="sticky bottom-[84px] z-10 -mx-4 border-t bg-card/95 p-4 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
              <Button className="h-12 w-full text-base" disabled={mutation.isPending}>
              Registrar
              </Button>
            </div>
            {message && <div className="rounded-md border p-2 text-sm text-muted-foreground">{message}</div>}
          </form>
        </CardContent>
      </Card>
      <PendingQueue currentRole={user?.role} />
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
      setSettlementMessage(`${result.count} movimiento(s) liquidados por ${money.format(result.total)}`)
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
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Movimiento administrativo
          </CardTitle>
          <p className="text-sm text-muted-foreground">No requiere PIN del empleado. Queda visible y auditado.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
            <GuidedBlock step="1" title="Empleado afectado" detail="Selecciona a quien se aplicará el cargo, ajuste o salida">
              <Select className="h-11" {...form.register("employeeId")}>
                <option value="">Seleccionar empleado</option>
                {employees.data?.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.phone} - {employee.fullName}
                  </option>
                ))}
              </Select>
            </GuidedBlock>
            <GuidedBlock step="2" title="Tipo y monto" detail="La empresa genera este movimiento de forma directa">
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
            <GuidedBlock step="3" title="Motivo y evidencia" detail="El motivo es obligatorio para evitar disputas">
              <Textarea placeholder="Motivo obligatorio" {...form.register("reason")} />
              <Textarea placeholder="Evidencia opcional / referencia / nota administrativa" {...form.register("evidenceNote")} />
            </GuidedBlock>
            <Button className="h-12 w-full text-base" disabled={mutation.isPending}>
              Crear movimiento administrativo
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const pending = useQuery({ queryKey: ["movements", "pending-full"], queryFn: () => api.movements({ status: "PENDING" }) })
  const audit = useQuery({
    queryKey: ["movement-audit", expandedId],
    queryFn: () => api.movementAudit(expandedId!),
    enabled: Boolean(expandedId)
  })
  const authorize = useMutation({
    mutationFn: (id: string) => api.authorizeMovement(id),
    onSuccess: async () => {
      setExpandedId(null)
      await queryClient.invalidateQueries({ queryKey: ["movements"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    }
  })
  const reject = useMutation({
    mutationFn: (id: string) => api.rejectMovement(id),
    onSuccess: async () => {
      setExpandedId(null)
      await queryClient.invalidateQueries({ queryKey: ["movements"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    }
  })
  const canProcess = currentRole !== "CAJERO" && currentRole !== "EMPLEADO"

  return (
    <Card>
      <CardHeader>
        <CardTitle>Autorizaciones Pendientes</CardTitle>
        <p className="text-sm text-muted-foreground">Solicitudes y movimientos pendientes con ruta clara de aprobación.</p>
      </CardHeader>
      <CardContent>
        {!pending.data?.length && <StatusText text="No hay movimientos pendientes." />}
        <div className="space-y-3">
          {pending.data?.map((movement) => {
            const isExpanded = expandedId === movement.id
            return (
              <div key={movement.id} className="rounded-lg border bg-background/45 p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{movement.folio}</span>
                      <Badge>{statusLabels[movement.status]}</Badge>
                      <Badge className={movement.origin === "EMPLOYEE_REQUEST" ? "border-primary/60 text-primary" : "border-accent/60 text-accent"}>
                        {movement.origin === "EMPLOYEE_REQUEST" ? "Solicitud empleado" : "Movimiento administrativo"}
                      </Badge>
                    </div>
                    <div className="font-semibold">{movement.employee?.fullName ?? "Empleado"}</div>
                    <div className="text-sm text-muted-foreground">
                      {movement.employee?.phone ?? "Sin teléfono"} · {movementLabels[movement.kind]} · {money.format(Number(movement.amount))}
                    </div>
                    <div className="text-sm text-muted-foreground">{movement.reason}</div>
                    <div className="text-xs text-muted-foreground">{new Date(movement.createdAt).toLocaleString("es-MX")}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setExpandedId(isExpanded ? null : movement.id)}>
                      {isExpanded ? "Ocultar" : "Ver detalle"}
                    </Button>
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
                {isExpanded && (
                  <div className="mt-3 grid gap-3 border-t pt-3 text-sm lg:grid-cols-2">
                    <div className="space-y-2">
                      <DetailLine label="Origen" value={movement.origin === "EMPLOYEE_REQUEST" ? "Solicitud creada por empleado" : "Movimiento creado por administración"} />
                      <DetailLine label="Responsable" value={movement.registeredBy?.fullName ?? (movement.origin === "EMPLOYEE_REQUEST" ? "Empleado por portal" : "Administración")} />
                      <DetailLine label="IP" value={movement.requestIp ?? "No registrado"} />
                      <DetailLine label="Dispositivo" value={movement.requestDevice ?? "No registrado"} />
                      <DetailLine label="Navegador" value={movement.requestUserAgent ?? "No registrado"} />
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase text-muted-foreground">Historial de cambios</div>
                      {!audit.data?.length && <div className="text-muted-foreground">Sin eventos adicionales.</div>}
                      {audit.data?.map((entry) => (
                        <div key={entry.id} className="rounded-md border p-2">
                          <div className="font-medium">{entry.action}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(entry.createdAt).toLocaleString("es-MX")} · {entry.user?.fullName ?? "Sistema/Empleado"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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

function PendingQueue({ currentRole }: { currentRole?: Role }) {
  const queryClient = useQueryClient()
  const pending = useQuery({ queryKey: ["movements", "pending"], queryFn: () => api.movements({ status: "PENDING" }) })
  const authorize = useMutation({
    mutationFn: (id: string) => api.authorizeMovement(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["movements"] })
  })
  const reject = useMutation({
    mutationFn: (id: string) => api.rejectMovement(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["movements"] })
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Autorizaciones pendientes</CardTitle>
      </CardHeader>
      <CardContent>
        <MovementTable
          movements={pending.data ?? []}
          actions={(movement) =>
            currentRole === "CAJERO" || currentRole === "EMPLEADO" ? null : (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => authorize.mutate(movement.id)}>
                  Autorizar
                </Button>
                <Button size="sm" variant="secondary" onClick={() => reject.mutate(movement.id)}>
                  Rechazar
                </Button>
              </div>
            )
          }
        />
      </CardContent>
    </Card>
  )
}

function History() {
  const [q, setQ] = useState("")
  const [status, setStatus] = useState("")
  const params = useMemo(() => ({ ...(q ? { q } : {}), ...(status ? { status } : {}) }), [q, status])
  const movements = useQuery({ queryKey: ["movements", params], queryFn: () => api.movements(params) })

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <CardTitle>Historial</CardTitle>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar" value={q} onChange={(event) => setQ(event.target.value)} />
          </div>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Estado</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </CardHeader>
      <CardContent>
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
  const employees = useQuery({ queryKey: ["employees"], queryFn: () => api.employees() })
  const form = useForm<z.infer<typeof employeeSchema>>({ resolver: zodResolver(employeeSchema) })
  const create = useMutation({
    mutationFn: (payload: z.infer<typeof employeeSchema>) =>
      api.createEmployee({ ...payload, branchId: user?.branch?.id }),
    onSuccess: async () => {
      form.reset()
      await queryClient.invalidateQueries({ queryKey: ["employees"] })
    }
  })

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRoundPlus className="h-4 w-4" />
            Empleado
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
          <CardTitle>Directorio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {employees.data?.map((employee: Employee) => (
              <div key={employee.id} className="rounded-md border p-3">
                <div className="font-medium">{employee.fullName}</div>
                <div className="text-sm text-muted-foreground">{employee.phone} · {employee.position}</div>
                <div className="mt-2 text-xs text-muted-foreground">{employee.branch.name}</div>
              </div>
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
  const [message, setMessage] = useState<string | null>(null)
  const [codeMessage, setCodeMessage] = useState<string | null>(null)
  const me = useQuery({ queryKey: ["employeePortal", "me"], queryFn: api.employeePortal.me })
  const balance = useQuery({ queryKey: ["employeePortal", "balance"], queryFn: api.employeePortal.balance })
  const movements = useQuery({ queryKey: ["employeePortal", "movements"], queryFn: api.employeePortal.movements })
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

  useEffect(() => {
    if (selectedKind === "DRINK") {
      form.setValue("amount", beveragePrice)
      form.setValue("productName", "Bebida")
      form.setValue("quantity", 1)
      form.setValue("unitPrice", beveragePrice)
      setConfirming(false)
    }
  }, [beveragePrice, form, selectedKind])

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
      form.reset({ kind: "SALARY_ADVANCE", amount: 0, reason: "" })
      await queryClient.invalidateQueries({ queryKey: ["employeePortal"] })
    },
    onError: (err: Error) => setMessage(err.message)
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
  const employeeRequests = (movements.data ?? []).filter((movement) => movement.origin === "EMPLOYEE_REQUEST")
  const adminMovements = (movements.data ?? []).filter((movement) => movement.origin === "ADMINISTRATIVE_ACTION")
  const recentMovements = (movements.data ?? []).slice(0, 4)
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
                onSubmit={form.handleSubmit((payload) => {
                  if (!confirming) {
                    setConfirming(true)
                    return
                  }
                  create.mutate(payload)
                })}
              >
                <GuidedBlock step="1" title="Tipo" detail="Selecciona una opción">
                  <Select className="h-12 rounded-2xl border-white/10 bg-black/20" {...form.register("kind")} onChange={(event) => {
                    form.setValue("kind", event.target.value as EmployeeRequestFormInput["kind"])
                    setConfirming(false)
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
                    <Input className="h-12 rounded-2xl border-white/10 bg-black/20" type="number" step="0.01" placeholder="Monto" {...form.register("amount", { onChange: () => setConfirming(false) })} />
                  )}
                </GuidedBlock>
                <GuidedBlock step="3" title="Motivo" detail="Describe brevemente la razón">
                  <Textarea className="rounded-2xl border-white/10 bg-black/20" placeholder="Motivo" {...form.register("reason", { onChange: () => setConfirming(false) })} />
                </GuidedBlock>
                {confirming && (
                  <div className="rounded-xl border border-primary/50 bg-primary/10 p-3 text-sm">
                    <div className="font-semibold">Confirmar solicitud</div>
                    <div className="mt-1 text-muted-foreground">
                      {movementLabels[values.kind as MovementKind]} · {money.format(Number(values.amount || 0))}
                    </div>
                  </div>
                )}
                <Button className="h-12 w-full rounded-2xl text-base shadow-lg shadow-primary/10" disabled={create.isPending}>
                  {confirming ? "Enviar solicitud" : "Continuar"}
                </Button>
                {message && <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm text-muted-foreground">{message}</div>}
              </form>
            </CardContent>
          </Card>
        )}

        {activeTab === "history" && (
          <>
            <PortalMovementList title="Solicitudes" movements={employeeRequests} />
            <PortalMovementList title="Administración" movements={adminMovements} admin />
          </>
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
