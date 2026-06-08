import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
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
  UserRoundPlus,
  UsersRound,
  Trash2,
  X,
  Phone
} from "lucide-react"
import { api, session } from "@/lib/api"
import type { Employee, Movement, MovementKind, MovementStatus, Payroll, PayrollItem, Role, User } from "@/types/domain"
import { useScrollDirection } from "@/hooks/useScrollDirection"
import { StatusEmpty, StatusText } from "@/components/common/Status"
import { AdminModal, DetailLine, GuidedBlock } from "@/components/common/AdminPrimitives"
import {
  adminMovementSchema,
  administrativeMovementKinds,
  adminUserEditSchema,
  adminUserSchema,
  configSchema,
  getInitials,
  getPayrollBadgeClass,
  getStatusBadgeClass,
  insetPanelStyle,
  insetPanelStrongStyle,
  money,
  movementLabels,
  payrollStatusLabels,
  ruleSchema,
  salaryTypeLabels,
  statusLabels,
  viewTitles,
  type AdminMovementFormInput,
  type AdminMovementFormOutput,
  type AdminUserEditFormInput,
  type AdminUserEditFormOutput,
  type AdminUserFormInput,
  type AdminUserFormOutput,
  type ConfigFormInput,
  type ConfigFormOutput,
  type EmployeeEditFormInput,
  type EmployeeEditFormOutput,
  type EmployeeFormInput,
  type EmployeeFormOutput,
  employeeEditSchema,
  employeeSchema,
  type RuleFormInput,
  type RuleFormOutput,
  type View
} from "@/lib/ledger-ui"
import fatboyLogo from "@/assets/logo.png"

export function Shell({
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
      <div className="bottom-nav-inner" style={{ gridTemplateColumns: `repeat(${views.length}, minmax(0, 1fr))` }}>
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
              <span className="bottom-nav-label">{navLabels[item.id]}</span>
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
            <div style={{ ...insetPanelStyle, padding: '0.75rem', borderRadius: '0.625rem' }}>
              <div className="stat-label">Solicitudes totales</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'hsl(var(--foreground))' }}>{data.cards.pendingMovements}</div>
            </div>
            <div style={{ ...insetPanelStyle, padding: '0.75rem', borderRadius: '0.625rem' }}>
              <div className="stat-label">Autorizados activos</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#4ade80' }}>{data.cards.authorizedMovements}</div>
            </div>
            <div style={{ ...insetPanelStyle, padding: '0.75rem', borderRadius: '0.625rem' }}>
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
    <div className="admin-two-column">
      <div className="admin-card min-w-0">
        <div className="admin-card-header">
          <div className="admin-card-title">
            <Building2 style={{ width: 14, height: 14, color: '#00e5ff' }} />
            Movimientos Administrativos
          </div>
        </div>
        <div className="admin-card-body">
          <form className="admin-compact-form" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
            <div className="form-field">
              <label className="form-label">Empleado</label>
              <select className="form-select" {...form.register("employeeId")}>
                <option value="">Seleccionar empleado</option>
                {employees.data?.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.phone} - {employee.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-form-row">
              <div className="form-field">
                <label className="form-label">Tipo</label>
                <select className="form-select" {...form.register("kind")}>
                  {administrativeMovementKinds.map((kind) => (
                    <option key={kind} value={kind}>{movementLabels[kind]}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Monto</label>
                <input className="form-input" type="number" step="0.01" placeholder="Monto" {...form.register("amount")} />
              </div>
            </div>
            <div className="form-field">
              <label className="form-label">Motivo</label>
              <textarea className="form-textarea" placeholder="Motivo obligatorio" {...form.register("reason")} />
            </div>
            <div className="form-field">
              <label className="form-label">Evidencia</label>
              <textarea className="form-textarea" placeholder="Evidencia / nota administrativa (opcional)" {...form.register("evidenceNote")} />
            </div>
            <div className="admin-inline-note">
              <span>Responsable</span>
              <strong>{user?.fullName ?? "Usuario administrativo"}</strong>
            </div>
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
        <div className="admin-card-body admin-compact-stack">
          <div className="settlement-controls">
            <div className="form-field">
              <label className="form-label">Empleado</label>
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
            </div>
            <div className="admin-form-row">
              <div className="form-field">
                <label className="form-label">Desde</label>
                <input
                  className="form-input"
                  type="date"
                  value={settlementFrom}
                  onChange={(event) => { setSettlementFrom(event.target.value); setSettlementMessage(null) }}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Hasta</label>
                <input
                  className="form-input"
                  type="date"
                  value={settlementTo}
                  onChange={(event) => { setSettlementTo(event.target.value); setSettlementMessage(null) }}
                />
              </div>
            </div>
          </div>

          <div className="settlement-summary-grid">
            <div className="mini-stat mini-stat-cyan">
              <div className="stat-label">Empleado</div>
              <div className="mini-stat-text">
                {selectedSettlementEmployee?.fullName ?? "Sin seleccionar"}
              </div>
            </div>
            <div className="mini-stat mini-stat-violet">
              <div className="stat-label">Total</div>
              <div className="mini-stat-value">
                {money.format(settlementSummary.data?.total ?? 0)}
              </div>
            </div>
            <div className="mini-stat">
              <div className="stat-label">Movimientos</div>
              <div className="mini-stat-value">
                {settlementSummary.data?.count ?? 0}
              </div>
            </div>
          </div>

          <div className="settlement-kind-list">
            {(settlementSummary.data?.byKind ?? []).map((item) => (
              <div
                key={item.kind}
                className="settlement-kind-row"
              >
                <span>{movementLabels[item.kind]}</span>
                <strong>{item.count} · {money.format(item.amount)}</strong>
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
          <div className="admin-inline-note">
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
              className="approval-card approval-card-compact"
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <div className="approval-card-main">
                <div className="approval-employee-avatar">{getInitials(name)}</div>
                <div className="approval-card-info">
                  <div className="approval-employee-name">{name}</div>
                  <div className="approval-card-meta">
                    <span>{movementLabels[movement.kind]}</span>
                    <span>{movement.folio}</span>
                  </div>
                  {movement.reason && <div className="approval-card-reason">{movement.reason}</div>}
                </div>
                <div className="approval-card-side">
                  <div className="approval-amount">{money.format(Number(movement.amount))}</div>
                  <div className="approval-date">{new Date(movement.createdAt).toLocaleString("es-MX", { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>

              {canProcess && (
                <div className="approval-actions">
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
      <div style={{ ...insetPanelStrongStyle, display: 'flex', gap: '0.375rem', padding: '0.25rem', borderRadius: '0.75rem', width: 'fit-content' }}>
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
          <div className="payroll-period-row">
            <label className="payroll-date-field">
              <span>Desde</span>
              <input
                type="date"
                className="form-input"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </label>
            <label className="payroll-date-field">
              <span>Hasta</span>
              <input
                type="date"
                className="form-input"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </label>
            <button className="btn-secondary payroll-action-btn" type="button" onClick={() => preview.mutate()} disabled={preview.isPending}>
              Previsualizar
            </button>
            <button className="btn-primary payroll-action-btn" type="button" disabled={!canGenerate} onClick={() => generate.mutate()}>
              Generar
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
                  ...insetPanelStrongStyle
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
    <div style={{ ...insetPanelStrongStyle, borderRadius: '0.875rem', overflowX: 'auto' }}>
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
                ...insetPanelStyle
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
            className="movement-row movement-row-compact"
            style={{ animationDelay: `${idx * 30}ms` }}
          >
            <div className="movement-mobile-head">
              <div className="min-w-0">
                <div className="movement-mobile-name">
                  {movement.employee?.fullName ?? "Empleado"}
                </div>
                <div className="movement-mobile-meta">{movementLabels[movement.kind]} · {movement.folio}</div>
              </div>
              <span className={getStatusBadgeClass(movement.status)}>{statusLabels[movement.status]}</span>
            </div>
            <div className="movement-mobile-foot">
              <span>{new Date(movement.createdAt).toLocaleString("es-MX", { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              <strong>
                {money.format(Number(movement.amount))}
              </strong>
            </div>
            {actions?.(movement) && <div>{actions(movement)}</div>}
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block" style={{ ...insetPanelStrongStyle, borderRadius: '0.875rem' }}>
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
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
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
      setCreateOpen(false)
      await queryClient.invalidateQueries({ queryKey: ["employees"] })
    }
  })
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EmployeeEditFormOutput }) =>
      api.updateEmployee(id, { ...payload, pin: payload.pin || undefined }),
    onSuccess: async (employee) => {
      setSelectedEmployeeId(employee.id)
      setEditOpen(false)
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
  const purgeDeveloperEmployee = useMutation({
    mutationFn: (employee: Employee) => api.purgeEmployeeForDeveloper(employee.id),
    onSuccess: async () => {
      setSelectedEmployeeId("")
      await queryClient.invalidateQueries({ queryKey: ["employees"] })
    }
  })

  const confirmDeveloperPurge = (employee: Employee) => {
    const confirmation = window.prompt(`Borrado definitivo de ${employee.fullName}. Escribe BORRAR para confirmar.`)
    if (confirmation === "BORRAR") {
      purgeDeveloperEmployee.mutate(employee)
    }
  }

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
        <div className="section-actions">
          {employees.data && <span className="section-count">{employees.data.length}</span>}
          <button className="btn-primary compact-action" type="button" onClick={() => setCreateOpen(true)}>
            <UserRoundPlus style={{ width: 14, height: 14 }} />
            Alta
          </button>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">Directorio de empleados</div>
        </div>
        <div className="admin-card-body">
          <div className="employee-directory-grid">
            {employees.data?.map((employee: Employee) => (
              <button
                key={employee.id}
                className={`employee-card ${selectedEmployeeId === employee.id ? "selected" : ""}`}
                type="button"
                onClick={() => {
                  setSelectedEmployeeId(employee.id)
                  setEditOpen(true)
                }}
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

      {createOpen && (
        <AdminModal title="Alta de empleado" subtitle="Formulario compacto" onClose={() => setCreateOpen(false)}>
          <form className="admin-modal-form" onSubmit={form.handleSubmit((values) => create.mutate(values))}>
            <input className="form-input" placeholder="Nombre completo" {...form.register("fullName")} />
            <div className="admin-form-row">
              <input className="form-input" placeholder="Puesto" {...form.register("position")} />
              <input className="form-input" placeholder="Teléfono" {...form.register("phone")} />
            </div>
            <input className="form-input" type="password" placeholder="PIN (6 dígitos)" {...form.register("pin")} />
            <div className="admin-form-row">
              <input className="form-input" type="number" step="0.01" placeholder="Sueldo base" {...form.register("salaryAmount")} />
              <select className="form-select" {...form.register("salaryType")}>
                {Object.entries(salaryTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="admin-form-row">
              <input className="form-input" type="date" {...form.register("hireDate")} />
              <select className="form-select" {...form.register("branchId")}>
                <option value="">Selecciona Sucursal</option>
                {branches.data?.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <button className="btn-primary modal-submit" disabled={create.isPending} type="submit">
              Guardar empleado
            </button>
            {create.error && <div className="status-empty" style={{ color: '#f87171', padding: '0.5rem' }}>{create.error.message}</div>}
          </form>
        </AdminModal>
      )}

      {editOpen && selectedEmployee && (
        <AdminModal title="Editar empleado" subtitle={selectedEmployee.fullName} onClose={() => setEditOpen(false)}>
          <form
            className="admin-modal-form"
            onSubmit={editForm.handleSubmit((values) => update.mutate({ id: selectedEmployee.id, payload: values }))}
          >
            <input className="form-input" placeholder="Nombre completo" {...editForm.register("fullName")} />
            <div className="admin-form-row">
              <input className="form-input" placeholder="Puesto" {...editForm.register("position")} />
              <input className="form-input" placeholder="Teléfono" {...editForm.register("phone")} />
            </div>
            <input className="form-input" type="password" placeholder="Nuevo PIN (opcional)" {...editForm.register("pin")} />
            <div className="admin-form-row">
              <input className="form-input" type="number" step="0.01" placeholder="Sueldo" {...editForm.register("salaryAmount")} />
              <select className="form-select" {...editForm.register("salaryType")}>
                {Object.entries(salaryTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="admin-form-row">
              <input className="form-input" type="date" {...editForm.register("hireDate")} />
              <select className="form-select" {...editForm.register("branchId")}>
                <option value="">Selecciona Sucursal</option>
                {branches.data?.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="admin-form-row">
              <button className="btn-primary" disabled={update.isPending} type="submit">Guardar empleado</button>
              <button
                className={selectedEmployee.active ? "btn-reject" : "btn-authorize"}
                type="button"
                disabled={toggleActive.isPending}
                onClick={() => toggleActive.mutate(selectedEmployee)}
              >
                {selectedEmployee.active ? "Desactivar" : "Activar"}
              </button>
            </div>
            {user?.role === "ADMINISTRADOR" && (
              <button
                className="btn-reject modal-submit"
                type="button"
                disabled={purgeDeveloperEmployee.isPending}
                onClick={() => confirmDeveloperPurge(selectedEmployee)}
              >
                <Trash2 style={{ width: 14, height: 14 }} />
                Purga dev
              </button>
            )}
            {update.error && <div className="status-empty" style={{ color: '#f87171', padding: '0.5rem' }}>{update.error.message}</div>}
            {toggleActive.error && <div className="status-empty" style={{ color: '#f87171', padding: '0.5rem' }}>{toggleActive.error.message}</div>}
            {purgeDeveloperEmployee.error && <div className="status-empty" style={{ color: '#f87171', padding: '0.5rem' }}>{purgeDeveloperEmployee.error.message}</div>}
          </form>
        </AdminModal>
      )}
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
