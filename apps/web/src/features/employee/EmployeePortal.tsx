import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Banknote, Building2, CheckCircle2, ClipboardList, KeyRound, LayoutDashboard, LogOut, Phone, UserRound, WalletCards, X } from "lucide-react"
import { api, employeeSession } from "@/lib/api"
import type { Movement, MovementKind, MovementSettlementTicket } from "@/types/domain"
import { useScrollDirection } from "@/hooks/useScrollDirection"
import { StatusEmpty } from "@/components/common/Status"
import { DetailLine, GuidedBlock } from "@/components/common/AdminPrimitives"
import {
  employeeRequestKinds,
  employeeRequestSchema,
  getInitials,
  getStatusBadgeClass,
  money,
  movementLabels,
  quickRequestReasons,
  statusLabels,
  type EmployeeRequestFormInput,
  type EmployeeRequestFormOutput
} from "@/lib/ledger-ui"
import fatboyLogo from "@/assets/logo.png"

export function EmployeePortal({ onLogout }: { onLogout: () => void }) {
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
          className="btn-icon rounded-full border border-border bg-secondary/50 text-foreground hover:bg-secondary w-10 h-10 flex items-center justify-center cursor-pointer"
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
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-2xl shadow-black/40" onClick={(event) => event.stopPropagation()}>
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

            <form className="mt-5 space-y-3 rounded-2xl border border-border bg-secondary/40 p-4" onSubmit={codeForm.handleSubmit((values) => changeCode.mutate(values))}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <KeyRound className="h-4 w-4 text-primary" />
                Cambiar PIN privado
              </div>
              <input className="form-input h-12 rounded-xl" placeholder="Código PIN actual" type="password" inputMode="numeric" maxLength={6} {...codeForm.register("currentCode")} />
              <input className="form-input h-12 rounded-xl" placeholder="Nuevo código PIN" type="password" inputMode="numeric" maxLength={6} {...codeForm.register("newCode")} />
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
          <div className="admin-card">
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
                    <div className="flex h-12 items-center justify-between rounded-xl border border-border bg-background/70 px-4 text-sm">
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
                  <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 px-4 py-2.5 text-xs">
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
                  <div className="rounded-xl border border-border bg-secondary/30 p-3 text-xs text-center text-muted-foreground mt-2">
                    {message}
                  </div>
                )}
              </form>
            </div>
          </div>
        )}

        {confirming && activeTab === "request" && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" onClick={() => setConfirming(false)}>
            <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-2xl shadow-black/40" onClick={(event) => event.stopPropagation()}>
              <div className="space-y-1">
                <div className="text-base font-bold text-foreground">{isDrink ? "Confirmar consumo de bebida" : "Confirmar Solicitud"}</div>
                <p className="text-xs text-muted-foreground">
                  {isDrink
                    ? "Confirma que estás solicitando el descuento por esta bebida consumida."
                    : "Verifica que los datos sean correctos antes de enviarla."}
                </p>
              </div>
              <div className="mt-4 space-y-2.5 rounded-2xl border border-border bg-secondary/30 p-4 text-xs">
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
      <div className="admin-card">
        <div className="admin-card-body space-y-3">
          <div className="flex rounded-2xl border border-border bg-background/70 p-1">
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
                  <div key={item.kind} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 px-3 py-1.5 text-xs">
                    <span className="min-w-0 truncate text-muted-foreground">{movementLabels[item.kind]}</span>
                    <span className="font-mono font-semibold text-foreground">{item.count} · {money.format(item.amount)}</span>
                  </div>
                ))}
                {!ticket.byKind.length && ticket.folios.length > 0 && (
                  <div className="rounded-xl border border-border bg-secondary/30 px-3 py-1.5 text-xs text-muted-foreground text-center">
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
