import { type ChangeEvent, useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Banknote,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Download,
  Eye,
  FileImage,
  ImagePlus,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Send,
  WalletCards,
  UserRoundPlus,
  UsersRound,
  Trash2,
  X,
  Phone,
  Pencil
} from "lucide-react"
import { api, session } from "@/lib/api"
import type { Employee, FileAsset, Incident, IncidentStatus, Movement, MovementKind, MovementStatus, Payroll, PayrollItem, Role, User } from "@/types/domain"
import { useScrollDirection } from "@/hooks/useScrollDirection"
import { StatusEmpty, StatusText } from "@/components/common/Status"
import { AdminModal, DetailLine, ExecutiveConfirmDialog, ExecutiveDatePicker, GuidedBlock } from "@/components/common/AdminPrimitives"
import { AttendanceAdmin } from "@/features/admin/AttendanceAdmin"
import {
  adminMovementSchema,
  administrativeMovementKinds,
  adminUserEditSchema,
  adminUserSchema,
  branchSchema,
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
  type BranchFormInput,
  type BranchFormOutput,
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
  const touchOptimizedLayout = useTouchOptimizedLayout()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("fatboy-admin-sidebar-collapsed") === "true")
  const [logoutOpen, setLogoutOpen] = useState(false)
  const handleLogout = () => setLogoutOpen(true)
  const confirmLogout = () => {
    session.token = null
    onLogout()
  }
  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current
      localStorage.setItem("fatboy-admin-sidebar-collapsed", String(next))
      return next
    })
  }

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
      { id: "asistencia" as const, label: "Asistencia", icon: Clock3 },
      { id: "adminMovements" as const, label: "Movimientos", icon: Building2 },
      { id: "incidencias" as const, label: "Incidencias", icon: MessageSquareText },
      { id: "dashboard" as const, label: "Resumen", icon: LayoutDashboard },
      { id: "configuracion" as const, label: "Config", icon: Settings }
    ]
  }, [me.data?.role])

  return (
    <main className="admin-shell min-h-screen">
      <div className="flex min-h-screen">
        {/* === Desktop Sidebar === */}
        <aside className={touchOptimizedLayout ? "admin-sidebar hidden" : `admin-sidebar hidden flex-col lg:flex ${sidebarCollapsed ? "collapsed" : ""}`} style={{ position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
          <div className="admin-sidebar-brand">
            <img src={fatboyLogo} alt="Fatboy" className="admin-sidebar-logo" />
            <div className="admin-sidebar-brand-copy">
              <div className="admin-sidebar-title">Fatboy RH</div>
              <div className="admin-sidebar-subtitle">Adelantos internos</div>
            </div>
            <button className="sidebar-collapse-control" type="button" title={sidebarCollapsed ? "Expandir menú" : "Ocultar menú"} aria-label={sidebarCollapsed ? "Expandir menú" : "Ocultar menú"} onClick={toggleSidebar}>
              {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </button>
          </div>
          <nav className="flex flex-col gap-0.5 p-2 flex-1">
            {views.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${activeView === item.id ? "active" : ""}`}
                onClick={() => onViewChange(item.id)}
                type="button"
                title={sidebarCollapsed ? item.label : undefined}
              >
                <span className="nav-icon-stage"><item.icon className="nav-icon" /></span>
                <span className="nav-item-label">{item.id === "pendientes" ? "Aprobaciones" : (item.id === "entregas" ? "Entregas" : viewTitles[item.id])}</span>
              </button>
            ))}
          </nav>
          <div className="p-2 border-t border-white/5">
            <button
              className="nav-item w-full"
              onClick={handleLogout}
              type="button"
              title={sidebarCollapsed ? "Cerrar sesión" : undefined}
            >
              <span className="nav-icon-stage"><LogOut className="nav-icon" /></span>
              <span className="nav-item-label">Cerrar sesión</span>
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
              <div className={touchOptimizedLayout ? "" : "lg:hidden"}>
                <img src={fatboyLogo} alt="" className="h-6 w-auto opacity-80" />
              </div>
              <div className="admin-header-user">
                <div className={touchOptimizedLayout ? "admin-header-view" : "admin-header-view lg:hidden"}>{viewTitles[activeView]}</div>
                <div className="admin-header-name">
                  {me.data?.fullName ?? "Usuario"}{" "}
                  {me.data?.branch?.name ? `(${me.data.branch.name})` : ""}{" "}
                  <span style={{ opacity: 0.4 }} className="mx-1">/</span>{" "}
                  <span className="admin-header-role-inline">{me.data?.role ?? ""}</span>
                </div>
              </div>
            </div>
            <button
              className={touchOptimizedLayout ? "btn-icon" : "btn-icon lg:hidden"}
              onClick={handleLogout}
              type="button"
              aria-label="Cerrar sesión"
            >
              <LogOut style={{ width: 16, height: 16 }} />
            </button>
          </header>
          <div className={touchOptimizedLayout ? "mobile-page flex-1 p-3" : "mobile-page flex-1 p-3 lg:p-4"}>
            {activeView === "dashboard" && <Dashboard />}
            {activeView === "empleados" && <Employees user={me.data} />}
            {activeView === "pendientes" && <PendingAuthorizations currentRole={me.data?.role} />}
            {activeView === "adminMovements" && <AdministrativeMovements user={me.data} />}
            {activeView === "incidencias" && <IncidentsAdmin user={me.data} />}
            {activeView === "historial" && <History />}
            {activeView === "nomina" && <PayrollAdmin />}
            {activeView === "asistencia" && <AttendanceAdmin user={me.data} />}
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
        touchOptimizedLayout={touchOptimizedLayout}
        style={{ transform: showNav ? "translateY(0)" : "translateY(100%)" }}
      />
      <ExecutiveConfirmDialog
        open={logoutOpen}
        title="¿Finalizar sesión?"
        description="Se cerrará el acceso administrativo en este dispositivo. Los cambios guardados permanecerán protegidos."
        confirmLabel="Cerrar sesión"
        onCancel={() => setLogoutOpen(false)}
        onConfirm={confirmLogout}
      />
    </main>
  )
}

function useTouchOptimizedLayout() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const touchQuery = window.matchMedia("(pointer: coarse), (hover: none)")
    const tabletWidthQuery = window.matchMedia("(max-width: 1366px)")
    const update = () => setEnabled(touchQuery.matches && tabletWidthQuery.matches)

    update()
    touchQuery.addEventListener("change", update)
    tabletWidthQuery.addEventListener("change", update)

    return () => {
      touchQuery.removeEventListener("change", update)
      tabletWidthQuery.removeEventListener("change", update)
    }
  }, [])

  return enabled
}

function MobileBottomNav({
  activeView,
  views,
  onViewChange,
  touchOptimizedLayout,
  style
}: {
  activeView: View
  views: Array<{ id: View; label: string; icon: typeof LayoutDashboard }>
  onViewChange: (view: View) => void
  touchOptimizedLayout: boolean
  style?: React.CSSProperties
}) {
  const navLabels: Record<View, string> = {
    pendientes: "Aprobar",
    historial: "Historial",
    incidencias: "Incid.",
    empleados: "Empleados",
    nomina: "Nómina",
    asistencia: "Asist.",
    adminMovements: "Movim.",
    dashboard: "Resumen",
    configuracion: "Config",
    entregas: "Entregas"
  }
  return (
    <nav className={touchOptimizedLayout ? "bottom-nav" : "bottom-nav lg:hidden"} style={style}>
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
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all")
  
  const periodStart = useMemo(() => startOfCurrentMonth(), [])
  const periodMovements = useQuery({
    queryKey: ["movements", "dashboard-period", periodStart],
    queryFn: () => api.movements({ from: periodStart })
  })

  const employeesQuery = useQuery({
    queryKey: ["employees", "active"],
    queryFn: () => api.employees("", false)
  })

  const branchesQuery = useQuery({
    queryKey: ["branches"],
    queryFn: () => api.branches()
  })

  const branchMovementsQuery = useQuery({
    queryKey: ["movements", "branch-non-discounted", selectedBranchId],
    queryFn: () => api.movements({ branchId: selectedBranchId }),
    enabled: selectedBranchId !== "all"
  })

  if (isLoading) return <StatusEmpty text="Cargando resumen..." />
  if (error) return <StatusEmpty text={(error as Error).message} />
  if (!data) return null

  const movements = periodMovements.data ?? []
  const filteredMovements = selectedBranchId === "all"
    ? movements
    : movements.filter((m) => m.employee?.branch?.id === selectedBranchId)

  const pendingRequests = selectedBranchId === "all"
    ? (periodMovements.data ? filteredMovements.filter((m) => m.origin === "EMPLOYEE_REQUEST" && m.status === "PENDING").length : data.cards.pendingMovements)
    : filteredMovements.filter((m) => m.origin === "EMPLOYEE_REQUEST" && m.status === "PENDING").length

  const authorizedAdvances = filteredMovements
    .filter((m) => m.kind === "SALARY_ADVANCE" && m.status === "AUTHORIZED")
    .reduce((t, m) => t + Number(m.amount), 0)

  const administrativeMovements = filteredMovements.filter((m) => m.origin === "ADMINISTRATIVE_ACTION").length

  const branchMovements = branchMovementsQuery.data ?? []
  const pendingToDiscount = selectedBranchId === "all"
    ? data.cards.pendingToDiscount
    : branchMovements
        .filter((m) => m.status === "AUTHORIZED" || m.status === "PARTIALLY_DISCOUNTED")
        .reduce((t, m) => t + Number(m.amount), 0)

  const employees = employeesQuery.data ?? []
  const filteredEmployees = selectedBranchId === "all"
    ? employees
    : employees.filter((e) => e.branch?.id === selectedBranchId)

  const totalWeeklyPayroll = filteredEmployees.reduce((total, emp) => {
    const amount = Number(emp.salaryAmount) || 0
    let weeklyAmount = 0
    if (emp.salaryType === "WEEKLY") {
      weeklyAmount = amount
    } else if (emp.salaryType === "BIWEEKLY") {
      weeklyAmount = amount / 2
    } else if (emp.salaryType === "DAILY") {
      weeklyAmount = amount * 7
    }
    return total + weeklyAmount
  }, 0)

  const totalPendingDetails = selectedBranchId === "all"
    ? data.cards.pendingMovements
    : movements.filter((m) => m.employee?.branch?.id === selectedBranchId && m.status === "PENDING").length

  const totalAuthorizedDetails = selectedBranchId === "all"
    ? data.cards.authorizedMovements
    : movements.filter((m) => m.employee?.branch?.id === selectedBranchId && m.status === "AUTHORIZED").length

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="section-title mb-0">
            <LayoutDashboard style={{ width: 16, height: 16, color: '#00e5ff' }} />
            Resumen del periodo
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="branch-select" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Sucursal:
            </label>
            <select
              id="branch-select"
              className="form-select text-xs py-1 px-2 h-8"
              style={{ minWidth: '160px', width: 'auto', background: 'rgb(var(--surface-control-strong) / 0.8)' }}
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
            >
              <option value="all">Todas las sucursales</option>
              {branchesQuery.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid metric-grid gap-3">
          <div className="stat-card stat-card-amber">
            <ShieldCheck className="stat-icon" style={{ color: '#f59e0b' }} />
            <div className="stat-label">Pendientes</div>
            <div className="stat-value stat-value-amber">
              {pendingRequests}
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
              {money.format(pendingToDiscount)}
            </div>
          </div>
          <div className="stat-card stat-card-blue">
            <UsersRound className="stat-icon" style={{ color: '#60a5fa' }} />
            <div className="stat-label">Costo Nómina Semanal</div>
            <div className="stat-value stat-value-blue" style={{ fontSize: '1.35rem' }}>
              {money.format(totalWeeklyPayroll)}
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
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'hsl(var(--foreground))' }}>{totalPendingDetails}</div>
            </div>
            <div style={{ ...insetPanelStyle, padding: '0.75rem', borderRadius: '0.625rem' }}>
              <div className="stat-label">Autorizados activos</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#4ade80' }}>{totalAuthorizedDetails}</div>
            </div>
            <div style={{ ...insetPanelStyle, padding: '0.75rem', borderRadius: '0.625rem' }}>
              <div className="stat-label">Estado</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                {periodMovements.isLoading || (selectedBranchId !== "all" && branchMovementsQuery.isLoading) ? "Actualizando..." : "Al corriente"}
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
                <ExecutiveDatePicker value={settlementFrom} title="Desde" onChange={(value) => { setSettlementFrom(value); setSettlementMessage(null) }} />
              </div>
              <div className="form-field">
                <label className="form-label">Hasta</label>
                <ExecutiveDatePicker value={settlementTo} title="Hasta" onChange={(value) => { setSettlementTo(value); setSettlementMessage(null) }} />
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

const incidentStatuses: IncidentStatus[] = ["REPORTADA", "VISTA", "EN_PROCESO", "RESUELTA", "CERRADA"]

const incidentStatusLabels: Record<IncidentStatus, string> = {
  REPORTADA: "Reportada",
  VISTA: "Vista",
  EN_PROCESO: "En proceso",
  RESUELTA: "Resuelta",
  CERRADA: "Cerrada"
}

function getIncidentBadgeClass(status: IncidentStatus) {
  switch (status) {
    case "REPORTADA": return "badge-status badge-pending"
    case "VISTA": return "badge-status badge-partial"
    case "EN_PROCESO": return "badge-status badge-discounted"
    case "RESUELTA": return "badge-status badge-authorized"
    case "CERRADA": return "badge-status badge-canceled"
    default: return "badge-status badge-canceled"
  }
}

function IncidentsAdmin({ user }: { user?: User }) {
  const queryClient = useQueryClient()
  const [selectedIncidentId, setSelectedIncidentId] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [status, setStatus] = useState("")
  const [employeeId, setEmployeeId] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [q, setQ] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [targetEmployeeId, setTargetEmployeeId] = useState("")
  const [branchId, setBranchId] = useState(user?.branch?.id ?? "")
  const [createFiles, setCreateFiles] = useState<File[]>([])
  const [detailFiles, setDetailFiles] = useState<File[]>([])
  const [comment, setComment] = useState("")
  const [statusMessage, setStatusMessage] = useState("")
  const [previewFile, setPreviewFile] = useState<FileAsset | null>(null)

  useEffect(() => {
    if (user?.branch?.id && !branchId) setBranchId(user.branch.id)
  }, [branchId, user?.branch?.id])

  const params = useMemo(
    () => ({
      ...(status ? { status: status as IncidentStatus } : {}),
      ...(employeeId ? { employeeId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(q ? { q } : {})
    }),
    [employeeId, from, q, status, to]
  )

  const incidents = useQuery({ queryKey: ["incidents", params], queryFn: () => api.incidents(params) })
  const incidentDetail = useQuery({
    queryKey: ["incident", selectedIncidentId],
    queryFn: () => api.incident(selectedIncidentId),
    enabled: Boolean(selectedIncidentId)
  })
  const employees = useQuery({ queryKey: ["employees", "incidents"], queryFn: () => api.employees() })
  const branches = useQuery({ queryKey: ["branches"], queryFn: () => api.branches() })

  useEffect(() => {
    if (!branchId && !targetEmployeeId && branches.data?.[0]?.id) {
      setBranchId(branches.data[0].id)
    }
  }, [branchId, branches.data, targetEmployeeId])

  const selectedIncident = incidentDetail.data ?? incidents.data?.find((incident) => incident.id === selectedIncidentId)
  const isDeveloperAdmin = user?.role === "ADMINISTRADOR"
  const selectedIncidentIsFinal = selectedIncident ? ["RESUELTA", "CERRADA"].includes(selectedIncident.status) : false

  const resetCreateForm = () => {
    setTitle("")
    setDescription("")
    setTargetEmployeeId("")
    setBranchId(user?.branch?.id ?? "")
    setCreateFiles([])
  }

  const createIncident = useMutation({
    mutationFn: async () => {
      const incident = await api.createIncident({
        title,
        description,
        employeeId: targetEmployeeId || undefined,
        branchId: targetEmployeeId ? undefined : branchId || user?.branch?.id
      })
      for (const file of createFiles) {
        await api.uploadFile({ file, module: "incidencias", entityId: incident.id, branchId: incident.branchId })
      }
      return api.incident(incident.id)
    },
    onSuccess: async (incident) => {
      resetCreateForm()
      setCreateOpen(false)
      setSelectedIncidentId(incident.id)
      await queryClient.invalidateQueries({ queryKey: ["incidents"] })
      await queryClient.invalidateQueries({ queryKey: ["incident", incident.id] })
    }
  })

  const addEvidence = useMutation({
    mutationFn: async () => {
      if (!selectedIncident) throw new Error("Selecciona una incidencia")
      for (const file of detailFiles) {
        await api.uploadFile({ file, module: "incidencias", entityId: selectedIncident.id, branchId: selectedIncident.branchId })
      }
      return api.incident(selectedIncident.id)
    },
    onSuccess: async (incident) => {
      setDetailFiles([])
      await queryClient.invalidateQueries({ queryKey: ["incidents"] })
      await queryClient.invalidateQueries({ queryKey: ["incident", incident.id] })
    }
  })

  const addMessage = useMutation({
    mutationFn: () => {
      if (!selectedIncident) throw new Error("Selecciona una incidencia")
      return api.addIncidentMessage(selectedIncident.id, comment)
    },
    onSuccess: async (incident) => {
      setComment("")
      await queryClient.invalidateQueries({ queryKey: ["incidents"] })
      await queryClient.invalidateQueries({ queryKey: ["incident", incident.id] })
    }
  })

  const updateStatus = useMutation({
    mutationFn: (nextStatus: IncidentStatus) => {
      if (!selectedIncident) throw new Error("Selecciona una incidencia")
      return api.updateIncidentStatus(selectedIncident.id, {
        status: nextStatus,
        message: statusMessage || undefined
      })
    },
    onSuccess: async (incident) => {
      setStatusMessage("")
      await queryClient.invalidateQueries({ queryKey: ["incidents"] })
      await queryClient.invalidateQueries({ queryKey: ["incident", incident.id] })
    }
  })

  const purgeIncident = useMutation({
    mutationFn: () => {
      if (!selectedIncident) throw new Error("Selecciona una incidencia")
      return api.purgeIncidentForDeveloper(selectedIncident.id)
    },
    onSuccess: async () => {
      const purgedId = selectedIncidentId
      setSelectedIncidentId("")
      setPreviewFile(null)
      await queryClient.invalidateQueries({ queryKey: ["incidents"] })
      if (purgedId) await queryClient.removeQueries({ queryKey: ["incident", purgedId] })
    }
  })

  const confirmIncidentPurge = () => {
    if (!selectedIncident) return
    const confirmation = window.prompt(`Borrado definitivo de ${selectedIncident.folio}. Escribe BORRAR para confirmar.`)
    if (confirmation === "BORRAR") {
      purgeIncident.mutate()
    }
  }

  const onCreateFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setCreateFiles(Array.from(event.target.files ?? []))
  }

  const onDetailFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDetailFiles(Array.from(event.target.files ?? []))
  }

  return (
    <div className="space-y-4">
      <div className="section-header">
        <div className="section-title">
          <MessageSquareText style={{ width: 16, height: 16, color: "#00e5ff" }} />
          Incidencias
        </div>
        <div className="section-actions">
          {incidents.data && <span className="section-count">{incidents.data.length}</span>}
          <button className="btn-primary compact-action" type="button" onClick={() => setCreateOpen(true)}>
            <ImagePlus style={{ width: 14, height: 14 }} />
            Reportar
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Buscar folio, empleado o descripción" value={q} onChange={(event) => setQ(event.target.value)} />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Todos los estados</option>
          {incidentStatuses.map((item) => (
            <option key={item} value={item}>{incidentStatusLabels[item]}</option>
          ))}
        </select>
        <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
          <option value="">Todos los empleados</option>
          {employees.data?.map((employee) => (
            <option key={employee.id} value={employee.id}>{employee.fullName}</option>
          ))}
        </select>
        <ExecutiveDatePicker value={from} onChange={setFrom} title="Desde" placeholder="Desde" />
        <ExecutiveDatePicker value={to} onChange={setTo} title="Hasta" placeholder="Hasta" />
      </div>

      <div className="incident-workspace">
        <div className="admin-card incident-list-card">
          <div className="admin-card-header">
            <div className="admin-card-title">Historial y seguimiento</div>
          </div>
          <div className="admin-card-body">
            {incidents.isLoading && <StatusEmpty text="Cargando incidencias..." />}
            {!incidents.isLoading && !incidents.data?.length && <StatusEmpty text="Sin incidencias con estos filtros" />}
            <div className="incident-list">
              {incidents.data?.map((incident) => (
                <button
                  key={incident.id}
                  className={`incident-list-item ${selectedIncidentId === incident.id ? "selected" : ""}`}
                  type="button"
                  onClick={() => setSelectedIncidentId(incident.id)}
                >
                  <div className="incident-list-top">
                    <span className="incident-folio">{incident.folio}</span>
                    <span className={getIncidentBadgeClass(incident.status)}>{incidentStatusLabels[incident.status]}</span>
                  </div>
                  <div className="incident-list-title">{incident.title}</div>
                  <div className="incident-list-meta">
                    {incident.employee?.fullName ?? "General"} · {incident.branch?.name ?? "Sucursal"} · {formatDateTime(incident.createdAt)}
                  </div>
                  <div className="incident-list-stats">
                    <span>{incident.messages.length} comentarios</span>
                    <span>{incident.evidence.length} evidencias</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="admin-card incident-detail-card">
          <div className="admin-card-header">
            <div className="admin-card-title">Detalle</div>
            <div className="incident-detail-header-actions">
              {selectedIncident && <span className={getIncidentBadgeClass(selectedIncident.status)}>{incidentStatusLabels[selectedIncident.status]}</span>}
              {selectedIncident && isDeveloperAdmin && (
                <button className="btn-reject" type="button" disabled={purgeIncident.isPending} onClick={confirmIncidentPurge}>
                  <Trash2 style={{ width: 13, height: 13 }} />
                  Eliminar prueba
                </button>
              )}
            </div>
          </div>
          <div className="admin-card-body">
            {!selectedIncident && <StatusEmpty text="Selecciona una incidencia para ver el seguimiento" />}
            {selectedIncident && (
              <div className="incident-detail">
                <div className="incident-detail-head">
                  <div>
                    <div className="incident-folio">{selectedIncident.folio}</div>
                    <h2>{selectedIncident.title}</h2>
                    <p>{selectedIncident.description}</p>
                  </div>
                  <div className="incident-detail-meta">
                    <DetailLine label="Empleado" value={selectedIncident.employee?.fullName ?? "General"} />
                    <DetailLine label="Sucursal" value={selectedIncident.branch?.name ?? "Sin sucursal"} />
                    <DetailLine label="Reportó" value={selectedIncident.reportedByUser?.fullName ?? "Sistema"} />
                    <DetailLine label="Fecha" value={formatDateTime(selectedIncident.createdAt)} />
                    <DetailLine label="Vista" value={formatDateTime(selectedIncident.viewedAt)} />
                    <DetailLine label="Cierre" value={formatDateTime(selectedIncident.closedAt ?? selectedIncident.resolvedAt)} />
                  </div>
                </div>

                <div className="incident-summary-strip">
                  <div>
                    <span>Que paso</span>
                    <strong>{selectedIncident.description}</strong>
                  </div>
                  <div>
                    <span>Donde</span>
                    <strong>{selectedIncident.employee?.fullName ? `${selectedIncident.employee.fullName} / ${selectedIncident.branch?.name ?? "Sucursal"}` : selectedIncident.branch?.name ?? "Sucursal"}</strong>
                  </div>
                  <div>
                    <span>Respuesta</span>
                    <strong>{selectedIncident.messages.length ? `${selectedIncident.messages.length} nota(s) de seguimiento` : "Sin respuesta registrada"}</strong>
                  </div>
                </div>

                <div className="incident-actions">
                  {incidentStatuses.map((item) => (
                    <button
                      key={item}
                      className={selectedIncident.status === item ? "btn-primary" : "btn-secondary"}
                      type="button"
                      disabled={updateStatus.isPending || selectedIncident.status === item}
                      onClick={() => updateStatus.mutate(item)}
                    >
                      {item === "VISTA" && <Eye style={{ width: 14, height: 14 }} />}
                      {incidentStatusLabels[item]}
                    </button>
                  ))}
                </div>
                <input
                  className="form-input"
                  placeholder="Nota opcional: que se reviso, quien atiende o que decision se tomo"
                  value={statusMessage}
                  onChange={(event) => setStatusMessage(event.target.value)}
                />

                <section className="incident-evidence-section">
                  <div className="incident-subtitle">
                    <FileImage style={{ width: 14, height: 14 }} />
                    Evidencias
                  </div>
                  <div className="incident-evidence-grid">
                    {selectedIncident.evidence.map((file) => (
                      <EvidenceThumb key={file.id} file={file} onOpen={setPreviewFile} />
                    ))}
                    {!selectedIncident.evidence.length && <div className="incident-empty-inline">Sin evidencias cargadas</div>}
                  </div>
                  <div className="incident-upload-row">
                    <input className="form-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onDetailFileChange} />
                    <button className="btn-secondary" type="button" disabled={!detailFiles.length || addEvidence.isPending} onClick={() => addEvidence.mutate()}>
                      <ImagePlus style={{ width: 14, height: 14 }} />
                      Subir
                    </button>
                  </div>
                </section>

                <section className="incident-chat">
                  <div className="incident-subtitle">
                    <MessageSquareText style={{ width: 14, height: 14 }} />
                    Seguimiento
                  </div>
                  <div className="incident-message-list">
                    <div className="incident-message system">
                      <div className="incident-message-meta">
                        <span>Registro inicial</span>
                        <span>{formatDateTime(selectedIncident.createdAt)}</span>
                      </div>
                      <div>{selectedIncident.description}</div>
                    </div>
                    {selectedIncident.messages.map((message) => (
                      <div key={message.id} className="incident-message">
                        <div className="incident-message-meta">
                          <span>{message.author?.fullName ?? "Sistema"}</span>
                          <span>{formatDateTime(message.createdAt)}</span>
                        </div>
                        <div>{message.message}</div>
                      </div>
                    ))}
                    {!selectedIncident.messages.length && <div className="incident-empty-inline">Sin comentarios todavía</div>}
                  </div>
                  <div className="incident-comment-row">
                    <textarea
                      className="form-textarea"
                      placeholder={selectedIncidentIsFinal ? "Incidencia finalizada" : "Respuesta o seguimiento: accion tomada, responsable, evidencia pendiente"}
                      value={comment}
                      disabled={selectedIncidentIsFinal}
                      onChange={(event) => setComment(event.target.value)}
                    />
                    <button className="btn-primary" type="button" disabled={!comment.trim() || addMessage.isPending || selectedIncidentIsFinal} onClick={() => addMessage.mutate()}>
                      <Send style={{ width: 14, height: 14 }} />
                      Enviar
                    </button>
                  </div>
                </section>

                {(updateStatus.error || addMessage.error || addEvidence.error || incidentDetail.error || purgeIncident.error) && (
                  <div className="status-empty" style={{ color: "#f87171", padding: "0.5rem" }}>
                    {(updateStatus.error || addMessage.error || addEvidence.error || incidentDetail.error || purgeIncident.error)?.message}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {createOpen && (
        <AdminModal title="Reporte de incidencia" subtitle="Empleado, observación y evidencias" onClose={() => setCreateOpen(false)}>
          <form
            className="admin-modal-form"
            onSubmit={(event) => {
              event.preventDefault()
              createIncident.mutate()
            }}
          >
            <input className="form-input" placeholder="Título breve" value={title} onChange={(event) => setTitle(event.target.value)} />
            <textarea className="form-textarea" placeholder="Observación o descripción de la incidencia" value={description} onChange={(event) => setDescription(event.target.value)} />
            <div className="admin-form-row">
              <select className="form-select" value={targetEmployeeId} onChange={(event) => setTargetEmployeeId(event.target.value)}>
                <option value="">Incidencia general</option>
                {employees.data?.map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.fullName}</option>
                ))}
              </select>
              <select
                className="form-select"
                value={branchId}
                disabled={Boolean(targetEmployeeId) || user?.role === "ENCARGADO"}
                onChange={(event) => setBranchId(event.target.value)}
              >
                <option value="">Sucursal</option>
                {branches.data?.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </div>
            <input className="form-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onCreateFileChange} />
            {createFiles.length > 0 && <div className="incident-empty-inline">{createFiles.length} archivo(s) seleccionados</div>}
            {!targetEmployeeId && !branchId && <div className="incident-empty-inline">Selecciona una sucursal para incidencia general.</div>}
            <button
              className="btn-primary modal-submit"
              type="submit"
              disabled={createIncident.isPending || !title.trim() || !description.trim() || (!targetEmployeeId && !branchId)}
            >
              Guardar incidencia
            </button>
            {createIncident.error && <div className="status-empty" style={{ color: "#f87171", padding: "0.5rem" }}>{createIncident.error.message}</div>}
          </form>
        </AdminModal>
      )}

      {previewFile && <EvidencePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  )
}

function EvidencePreviewModal({ file, onClose }: { file: FileAsset; onClose: () => void }) {
  const [url, setUrl] = useState("")
  const blob = useQuery({
    queryKey: ["file-blob", file.id],
    queryFn: () => api.fileBlob(file.id),
    staleTime: Infinity
  })

  useEffect(() => {
    if (!blob.data) return
    const objectUrl = URL.createObjectURL(blob.data)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob.data])

  const download = () => {
    if (!url) return
    const link = document.createElement("a")
    link.href = url
    link.download = file.originalName
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <div className="incident-preview-backdrop" role="dialog" aria-modal="true">
      <div className="incident-preview-modal">
        <div className="incident-preview-header">
          <div>
            <div className="incident-folio">Evidencia</div>
            <h3>{file.originalName}</h3>
          </div>
          <div className="incident-preview-actions">
            <button className="btn-secondary" type="button" onClick={download} disabled={!url}>
              <Download style={{ width: 14, height: 14 }} />
              Descargar
            </button>
            <button className="btn-icon" type="button" onClick={onClose} title="Cerrar">
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>
        </div>
        <div className="incident-preview-body">
          {url ? <img src={url} alt={file.originalName} /> : <StatusEmpty text="Cargando imagen..." />}
        </div>
        {blob.error && <div className="status-empty" style={{ color: "#f87171", padding: "0.5rem" }}>{blob.error.message}</div>}
      </div>
    </div>
  )
}

function EvidenceThumb({ file, onOpen }: { file: FileAsset; onOpen: (file: FileAsset) => void }) {
  const [url, setUrl] = useState("")
  const blob = useQuery({
    queryKey: ["file-blob", file.id],
    queryFn: () => api.fileBlob(file.id),
    staleTime: Infinity
  })

  useEffect(() => {
    if (!blob.data) return
    const objectUrl = URL.createObjectURL(blob.data)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob.data])

  const download = async () => {
    const data = blob.data ?? await api.fileBlob(file.id)
    const shouldRevoke = !url
    const objectUrl = url || URL.createObjectURL(data)
    const link = document.createElement("a")
    link.href = objectUrl
    link.download = file.originalName
    document.body.appendChild(link)
    link.click()
    link.remove()
    if (shouldRevoke) URL.revokeObjectURL(objectUrl)
  }

  return (
    <div className="incident-evidence-thumb">
      <button className="incident-evidence-preview" type="button" onClick={() => onOpen(file)} disabled={!url}>
        {url ? <img src={url} alt={file.originalName} /> : <FileImage style={{ width: 28, height: 28 }} />}
      </button>
      <div className="incident-evidence-name" title={file.originalName}>{file.originalName}</div>
      <div className="incident-evidence-actions">
        <button className="btn-icon" type="button" title="Ver completa" onClick={() => onOpen(file)} disabled={!url}>
          <Maximize2 style={{ width: 13, height: 13 }} />
        </button>
        <button className="btn-icon" type="button" title="Descargar" onClick={download} disabled={blob.isLoading}>
          <Download style={{ width: 13, height: 13 }} />
        </button>
      </div>
    </div>
  )
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
        <ExecutiveDatePicker value={from} onChange={setFrom} title="Desde" placeholder="Desde" />
        <ExecutiveDatePicker value={to} onChange={setTo} title="Hasta" placeholder="Hasta" />
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
              <ExecutiveDatePicker value={periodStart} onChange={setPeriodStart} title="Desde" />
            </label>
            <label className="payroll-date-field">
              <span>Hasta</span>
              <ExecutiveDatePicker value={periodEnd} onChange={setPeriodEnd} title="Hasta" />
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
            {movement.evidenceFile && <MovementEvidenceButton movement={movement} />}
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
              <th>Evidencia</th>
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
                <td>{movement.evidenceFile ? <MovementEvidenceButton movement={movement} /> : <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem' }}>--</span>}</td>
                {actions && <td>{actions(movement)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function MovementEvidenceButton({ movement }: { movement: Movement }) {
  const [loading, setLoading] = useState(false)
  if (!movement.evidenceFile) return null

  async function openEvidence() {
    if (!movement.evidenceFile) return
    setLoading(true)
    try {
      const blob = await api.fileBlob(movement.evidenceFile.id)
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank", "noopener,noreferrer")
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button className="btn-icon" type="button" title="Ver foto de evidencia" onClick={openEvidence} disabled={loading}>
      <FileImage style={{ width: 13, height: 13 }} />
    </button>
  )
}

function Employees({ user }: { user?: User }) {
  const queryClient = useQueryClient()
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const employees = useQuery({ queryKey: ["employees", "admin-all"], queryFn: () => api.employees(undefined, true) })
  const branches = useQuery({ queryKey: ["branches"], queryFn: () => api.branches() })
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
              <ExecutiveDatePicker value={form.watch("hireDate") ?? ""} onChange={(value) => form.setValue("hireDate", value, { shouldDirty: true, shouldValidate: true })} title="Fecha de ingreso" />
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
              <ExecutiveDatePicker value={editForm.watch("hireDate") ?? ""} onChange={(value) => editForm.setValue("hireDate", value, { shouldDirty: true, shouldValidate: true })} title="Fecha de ingreso" />
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
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  confirmDeveloperPurge(selectedEmployee)
                }}
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
  const [editRuleId, setEditRuleId] = useState("")
  const [editBranchId, setEditBranchId] = useState("")
  const [settingsTab, setSettingsTab] = useState<"general" | "branches" | "users" | "rules">("general")

  const configuration = useQuery({ queryKey: ["configuration"], queryFn: api.configuration })
  const rules = useQuery({ queryKey: ["rules"], queryFn: api.rules })
  const branches = useQuery({ queryKey: ["branches-admin-all"], queryFn: () => api.branches(true) })
  const adminUsers = useQuery({ queryKey: ["admin-users"], queryFn: api.adminUsers })

  const activeBranches = branches.data?.filter(b => b.active) ?? []
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
    defaultValues: { role: "ENCARGADO", branchId: "", approvalPin: "" }
  })
  
  const userEditForm = useForm<AdminUserEditFormInput, unknown, AdminUserEditFormOutput>({
    resolver: zodResolver(adminUserEditSchema),
    defaultValues: { fullName: "", email: "", password: "", role: "ENCARGADO", branchId: "" }
  })

  const branchForm = useForm<BranchFormInput, unknown, BranchFormOutput>({
    resolver: zodResolver(branchSchema),
    defaultValues: { name: "", code: "" }
  })

  const selectedBranchForEdit = branches.data?.find((b) => b.id === editBranchId)
  const branchEditForm = useForm<{ name: string; code: string; active: boolean }>({
    defaultValues: { name: "", code: "", active: true }
  })

  useEffect(() => {
    if (selectedBranchForEdit) {
      branchEditForm.reset({
        name: selectedBranchForEdit.name,
        code: selectedBranchForEdit.code,
        active: selectedBranchForEdit.active
      })
    }
  }, [selectedBranchForEdit, branchEditForm])

  const selectedRuleForEdit = rules.data?.find((r) => r.id === editRuleId)
  const ruleEditForm = useForm<RuleFormInput, unknown, RuleFormOutput>({
    resolver: zodResolver(ruleSchema),
    defaultValues: { requiredRole: "ENCARGADO", minAmount: 0 }
  })

  useEffect(() => {
    if (selectedRuleForEdit) {
      ruleEditForm.reset({
        kind: selectedRuleForEdit.kind ?? undefined,
        minAmount: Number(selectedRuleForEdit.minAmount),
        maxAmount: selectedRuleForEdit.maxAmount ? Number(selectedRuleForEdit.maxAmount) : undefined,
        requiredRole: selectedRuleForEdit.requiredRole as RuleFormInput["requiredRole"]
      })
    }
  }, [selectedRuleForEdit, ruleEditForm])

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
      approvalPin: "",
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

  const updateRule = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Partial<RuleFormOutput> & { active?: boolean } }) =>
      api.updateRule(id, { ...values, kind: values.kind || null, maxAmount: values.maxAmount || null }),
    onSuccess: () => {
      setEditRuleId("")
      queryClient.invalidateQueries({ queryKey: ["rules"] })
    }
  })

  const deleteRule = useMutation({
    mutationFn: (id: string) => api.deleteRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] })
    }
  })

  const createBranch = useMutation({
    mutationFn: (values: BranchFormOutput) => api.createBranch(values),
    onSuccess: () => {
      branchForm.reset({ name: "", code: "" })
      queryClient.invalidateQueries({ queryKey: ["branches-admin-all"] })
      queryClient.invalidateQueries({ queryKey: ["branches"] })
    }
  })

  const updateBranch = useMutation({
    mutationFn: ({ id, values }: { id: string; values: { name?: string; code?: string; active?: boolean } }) =>
      api.updateBranch(id, values),
    onSuccess: () => {
      setEditBranchId("")
      queryClient.invalidateQueries({ queryKey: ["branches-admin-all"] })
      queryClient.invalidateQueries({ queryKey: ["branches"] })
    }
  })

  const deleteBranch = useMutation({
    mutationFn: (id: string) => api.deleteBranch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches-admin-all"] })
      queryClient.invalidateQueries({ queryKey: ["branches"] })
    }
  })

  const createUser = useMutation({
    mutationFn: (values: AdminUserFormOutput) => api.createAdminUser(values),
    onSuccess: async () => {
      userForm.reset({ role: "ENCARGADO", fullName: "", email: "", password: "", approvalPin: "" })
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    }
  })

  const updateUser = useMutation({
    mutationFn: ({ id, values }: { id: string; values: AdminUserEditFormOutput }) =>
      api.updateAdminUser(id, { ...values, password: values.password || undefined, approvalPin: values.approvalPin || undefined }),
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
        <div className="section-actions">
          {configuration.data && <span className="section-count">Sistema activo</span>}
        </div>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="Secciones de configuración">
        {[
          { id: "general", label: "General", icon: Banknote, count: "Base" },
          { id: "branches", label: "Sucursales", icon: Building2, count: String(branches.data?.length ?? 0) },
          { id: "users", label: "Usuarios", icon: KeyRound, count: String(adminUsers.data?.length ?? 0) },
          { id: "rules", label: "Reglas", icon: ShieldCheck, count: String(rules.data?.length ?? 0) }
        ].map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              className={`settings-tab ${settingsTab === item.id ? "active" : ""}`}
              type="button"
              onClick={() => setSettingsTab(item.id as typeof settingsTab)}
            >
              <Icon style={{ width: 15, height: 15 }} />
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </button>
          )
        })}
      </div>

      {settingsTab === "general" && (
        <div className="settings-layout">
          <div className="settings-primary-column">
            <div className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">
                  <Banknote style={{ width: 14, height: 14, color: '#fbbf24' }} />
                  Precio de bebida
                </div>
              </div>
              <div className="admin-card-body">
                <form className="settings-form" onSubmit={configForm.handleSubmit((values) => updateConfig.mutate(values))}>
                  <div className="form-field">
                    <label className="form-label">Precio que se descuenta al empleado</label>
                    <input className="form-input" type="number" step="0.01" placeholder="Precio" {...configForm.register("beveragePrice")} />
                  </div>
                  <button className="btn-primary modal-submit" disabled={updateConfig.isPending} type="submit">
                    Guardar precio
                  </button>
                  {updateConfig.error && <div className="status-empty compact-error">{updateConfig.error.message}</div>}
                </form>
              </div>
            </div>
          </div>
          <div className="settings-secondary-column">
            <div className="settings-metric-grid">
              <button className="settings-action-tile" type="button" onClick={() => setSettingsTab("branches")}>
                <Building2 style={{ width: 17, height: 17 }} />
                <span>Gestionar sucursales</span>
                <strong>{activeBranches.length} activas</strong>
              </button>
              <button className="settings-action-tile" type="button" onClick={() => setSettingsTab("users")}>
                <KeyRound style={{ width: 17, height: 17 }} />
                <span>Administrar usuarios</span>
                <strong>{adminUsers.data?.filter((item) => item.active).length ?? 0} activos</strong>
              </button>
              <button className="settings-action-tile" type="button" onClick={() => setSettingsTab("rules")}>
                <ShieldCheck style={{ width: 17, height: 17 }} />
                <span>Control de autorización</span>
                <strong>{rules.data?.length ?? 0} reglas</strong>
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsTab === "branches" && (
        <div className="settings-layout">
          <div className="settings-primary-column">
            <div className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">
                  <Building2 style={{ width: 14, height: 14, color: '#00e5ff' }} />
                  Nueva sucursal
                </div>
              </div>
              <div className="admin-card-body">
                <form className="settings-form" onSubmit={branchForm.handleSubmit((values) => createBranch.mutate(values))}>
                  <input className="form-input" placeholder="Nombre de sucursal" {...branchForm.register("name")} />
                  <input className="form-input" placeholder="Código único (ej. NORTE)" {...branchForm.register("code")} />
                  <button className="btn-primary modal-submit" disabled={createBranch.isPending} type="submit">Crear sucursal</button>
                  {createBranch.error && <div className="status-empty compact-error">{createBranch.error.message}</div>}
                </form>
              </div>
            </div>
          </div>
          <div className="settings-secondary-column">
            <div className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">Catálogo de sucursales</div>
                {branches.data && <span className="section-count">{branches.data.length}</span>}
              </div>
              <div className="admin-card-body">
                <div className="settings-list-grid">
                  {branches.data?.map((branch) => (
                    <div key={branch.id} className={`settings-list-card ${editBranchId === branch.id ? "selected" : ""}`}>
                      <div className="settings-list-main">
                        <div className="settings-list-title">{branch.name}</div>
                        <div className="settings-list-meta">{branch.code}</div>
                      </div>
                      <span className={branch.active ? "badge-status badge-authorized" : "badge-status badge-canceled"}>
                        {branch.active ? "Activa" : "Inact."}
                      </span>
                      <div className="settings-row-actions">
                        <button className="btn-icon" onClick={() => setEditBranchId(branch.id)} type="button" title="Editar sucursal">
                          <Pencil style={{ width: 13, height: 13 }} />
                        </button>
                        {branch.active && (
                          <button
                            className="btn-icon danger"
                            onClick={() => {
                              if (confirm(`¿Estás seguro de que deseas desactivar la sucursal ${branch.name}?`)) {
                                deleteBranch.mutate(branch.id)
                              }
                            }}
                            type="button"
                            title="Desactivar sucursal"
                          >
                            <Trash2 style={{ width: 13, height: 13 }} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!branches.data?.length && <StatusEmpty text="Sin sucursales registradas." />}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {settingsTab === "users" && (
        <div className="settings-layout">
          <div className="settings-primary-column">
            <div className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">
                  <UserRoundPlus style={{ width: 14, height: 14, color: '#00e5ff' }} />
                  Nuevo usuario
                </div>
              </div>
              <div className="admin-card-body">
                <form className="settings-form" onSubmit={userForm.handleSubmit((values) => createUser.mutate(values))}>
                  <input className="form-input" placeholder="Nombre completo" {...userForm.register("fullName")} />
                  <input className="form-input" placeholder="Correo electrónico" type="email" {...userForm.register("email")} />
                  <input className="form-input" placeholder="Contraseña temporal" type="password" {...userForm.register("password")} />
                  <input className="form-input" placeholder="Código de aprobación (6 dígitos)" type="password" inputMode="numeric" maxLength={6} {...userForm.register("approvalPin")} />
                  <select className="form-select" {...userForm.register("role")}>
                    {["ENCARGADO", "GERENTE", "CAJERO", "ADMINISTRADOR"].map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  <select className="form-select" {...userForm.register("branchId")}>
                    <option value="">Sin sucursal (Matriz/Global)</option>
                    {activeBranches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  <button className="btn-primary modal-submit" disabled={createUser.isPending} type="submit">Crear usuario</button>
                  {createUser.error && <div className="status-empty compact-error">{createUser.error.message}</div>}
                </form>
              </div>
            </div>
          </div>
          <div className="settings-secondary-column">
            <div className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">Usuarios administrativos</div>
                {adminUsers.data && <span className="section-count">{adminUsers.data.length}</span>}
              </div>
              <div className="admin-card-body">
                <div className="settings-list-grid">
                  {adminUsers.data?.map((user) => (
                    <button
                      key={user.id}
                      className={`settings-list-card interactive ${selectedUserId === user.id ? "selected" : ""}`}
                      type="button"
                      onClick={() => setSelectedUserId(user.id)}
                    >
                      <div className="settings-list-main">
                        <div className="settings-list-title">{user.fullName}</div>
                        <div className="settings-list-meta">{user.email}</div>
                        <div className="settings-list-meta accent">{user.role} {user.branch ? `- ${user.branch.name}` : ""}</div>
                      </div>
                      <span className={user.active ? "badge-status badge-authorized" : "badge-status badge-canceled"}>
                        {user.active ? "Activo" : "Inact."}
                      </span>
                    </button>
                  ))}
                  {!adminUsers.data?.length && <StatusEmpty text="Sin usuarios administrativos." />}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {settingsTab === "rules" && (
        <div className="settings-layout">
          <div className="settings-primary-column">
            <div className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">
                  <ShieldCheck style={{ width: 14, height: 14, color: '#a855f7' }} />
                  Nueva regla
                </div>
              </div>
              <div className="admin-card-body">
                <form className="settings-form" onSubmit={form.handleSubmit((values) => createRule.mutate(values))}>
                  <select className="form-select" {...form.register("kind")}>
                    <option value="">Todos los tipos</option>
                    {Object.entries(movementLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <div className="admin-form-row">
                    <input className="form-input" type="number" step="0.01" placeholder="Monto mínimo" {...form.register("minAmount")} />
                    <input className="form-input" type="number" step="0.01" placeholder="Monto máximo" {...form.register("maxAmount")} />
                  </div>
                  <select className="form-select" {...form.register("requiredRole")}>
                    {["ENCARGADO", "GERENTE", "ADMINISTRADOR"].map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  <button className="btn-primary modal-submit" disabled={createRule.isPending} type="submit">Guardar regla</button>
                  {createRule.error && <div className="status-empty compact-error">{createRule.error.message}</div>}
                </form>
              </div>
            </div>
          </div>
          <div className="settings-secondary-column">
            <div className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">Reglas de autorización activas</div>
                {rules.data && <span className="section-count">{rules.data.length}</span>}
              </div>
              <div className="admin-card-body">
                <div className="settings-list-grid">
                  {rules.data?.map((rule) => (
                    <div key={rule.id} className="settings-rule-row">
                      <div className="settings-list-main">
                        <div className="settings-list-title">{rule.kind ? movementLabels[rule.kind as MovementKind] : "Todos los tipos"}</div>
                        <div className="settings-list-meta">{money.format(Number(rule.minAmount))} - {rule.maxAmount ? money.format(Number(rule.maxAmount)) : "sin límite"}</div>
                      </div>
                      <span className="badge-status badge-discounted">{rule.requiredRole}</span>
                      <div className="settings-row-actions">
                        <button className="btn-icon" onClick={() => setEditRuleId(rule.id)} type="button" title="Editar regla">
                          <Pencil style={{ width: 13, height: 13 }} />
                        </button>
                        <button
                          className="btn-icon danger"
                          onClick={() => {
                            if (confirm("¿Estás seguro de que deseas eliminar esta regla de autorización?")) {
                              deleteRule.mutate(rule.id)
                            }
                          }}
                          type="button"
                          title="Eliminar regla"
                        >
                          <Trash2 style={{ width: 13, height: 13 }} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {!rules.data?.length && <StatusEmpty text="Sin reglas de autorización configuradas." />}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {selectedUser && (
        <AdminModal title="Editar acceso de usuario" subtitle={selectedUser.fullName} onClose={() => setSelectedUserId("")}>
          <form
            className="admin-modal-form"
            onSubmit={userEditForm.handleSubmit((values) => updateUser.mutate({ id: selectedUser.id, values }))}
          >
            <input className="form-input" placeholder="Nombre completo" {...userEditForm.register("fullName")} />
            <input className="form-input" placeholder="Correo" type="email" {...userEditForm.register("email")} />
            <input className="form-input" placeholder="Nueva contraseña (opcional)" type="password" {...userEditForm.register("password")} />
            <input className="form-input" placeholder="Nuevo código de aprobación (opcional)" type="password" inputMode="numeric" maxLength={6} {...userEditForm.register("approvalPin")} />
            <select className="form-select" {...userEditForm.register("role")}>
              {["ENCARGADO", "GERENTE", "CAJERO", "ADMINISTRADOR"].map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <select className="form-select" {...userEditForm.register("branchId")}>
              <option value="">Sin sucursal (Matriz/Global)</option>
              {activeBranches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <div className="admin-form-row">
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
            {updateUser.error && <div className="status-empty compact-error">{updateUser.error.message}</div>}
            {toggleUser.error && <div className="status-empty compact-error">{toggleUser.error.message}</div>}
          </form>
        </AdminModal>
      )}

      {/* Edit Rule Modal */}
      {editRuleId && selectedRuleForEdit && (
        <AdminModal title="Editar regla de autorización" subtitle="Modificar montos o rol" onClose={() => setEditRuleId("")}>
          <form
            className="admin-modal-form"
            onSubmit={ruleEditForm.handleSubmit((values) => updateRule.mutate({ id: editRuleId, values }))}
          >
            <div className="form-field">
              <label className="form-label">Tipo de movimiento</label>
              <select className="form-select" {...ruleEditForm.register("kind")}>
                <option value="">Todos los tipos</option>
                {Object.entries(movementLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="admin-form-row">
              <div className="form-field">
                <label className="form-label">Monto mínimo</label>
                <input className="form-input" type="number" step="0.01" placeholder="Monto mínimo" {...ruleEditForm.register("minAmount")} />
              </div>
              <div className="form-field">
                <label className="form-label">Monto máximo</label>
                <input className="form-input" type="number" step="0.01" placeholder="Monto máximo" {...ruleEditForm.register("maxAmount")} />
              </div>
            </div>
            <div className="form-field">
              <label className="form-label">Rol requerido</label>
              <select className="form-select" {...ruleEditForm.register("requiredRole")}>
                {["ENCARGADO", "GERENTE", "ADMINISTRADOR"].map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
            <button className="btn-primary modal-submit mt-2" disabled={updateRule.isPending} type="submit">
              Guardar regla
            </button>
            {updateRule.error && <div className="status-empty" style={{ color: '#f87171', padding: '0.5rem' }}>{updateRule.error.message}</div>}
          </form>
        </AdminModal>
      )}

      {/* Edit Branch Modal */}
      {editBranchId && selectedBranchForEdit && (
        <AdminModal title="Editar sucursal" subtitle={selectedBranchForEdit.name} onClose={() => setEditBranchId("")}>
          <form
            className="admin-modal-form"
            onSubmit={branchEditForm.handleSubmit((values) => updateBranch.mutate({ id: editBranchId, values }))}
          >
            <div className="form-field">
              <label className="form-label">Nombre de sucursal</label>
              <input className="form-input" placeholder="Nombre completo" {...branchEditForm.register("name")} />
            </div>
            <div className="form-field">
              <label className="form-label">Código (Único)</label>
              <input className="form-input" placeholder="Ej. MATRIZ" {...branchEditForm.register("code")} />
            </div>
            <div className="flex items-center gap-2 mt-4">
              <input
                type="checkbox"
                id="branch-active-checkbox"
                style={{ width: '1.15rem', height: '1.15rem', accentColor: '#00e5ff' }}
                {...branchEditForm.register("active")}
              />
              <label htmlFor="branch-active-checkbox" className="text-sm font-semibold text-foreground select-none cursor-pointer">
                Sucursal activa
              </label>
            </div>
            <button className="btn-primary modal-submit mt-4" disabled={updateBranch.isPending} type="submit">
              Guardar cambios
            </button>
            {updateBranch.error && <div className="status-empty" style={{ color: '#f87171', padding: '0.5rem' }}>{updateBranch.error.message}</div>}
          </form>
        </AdminModal>
      )}
    </div>
  )
}
