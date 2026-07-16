import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertTriangle, Banknote, Building2, CalendarDays, CheckCircle2, ClipboardList, KeyRound, LayoutDashboard, LogOut, MapPin, Sparkles, UserRound, WalletCards, X } from "lucide-react"
import { api, employeeSession } from "@/lib/api"
import type { EmployeeWorkSchedule, Movement, MovementKind, MovementSettlementTicket, TimeClockEmployeeVerification, TimeClockEventType } from "@/types/domain"
import { useScrollDirection } from "@/hooks/useScrollDirection"
import { StatusEmpty } from "@/components/common/Status"
import { DetailLine } from "@/components/common/AdminPrimitives"
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

type EmployeeTab = "home" | "attendance" | "request" | "history"

type MobileLocation = {
  latitude: number
  longitude: number
  accuracy: number
}

const attendanceActionLabels: Record<TimeClockEventType, string> = {
  ENTRY: "Registrar entrada",
  BREAK_START: "Salir a comida",
  BREAK_END: "Regresar de comida",
  EXIT: "Cerrar turno"
}

export function EmployeePortal({ onLogout }: { onLogout: () => void }) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<EmployeeTab>("home")
  const [historyTab, setHistoryTab] = useState<"current" | "settled">("current")
  const [accountOpen, setAccountOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [codeMessage, setCodeMessage] = useState<string | null>(null)
  const [attendancePin, setAttendancePin] = useState("")
  const [attendanceMessage, setAttendanceMessage] = useState<string | null>(null)
  const [attendancePreview, setAttendancePreview] = useState<TimeClockEmployeeVerification | null>(null)
  const [reasonType, setReasonType] = useState<(typeof quickRequestReasons)[number]>("Personal")
  const [customReason, setCustomReason] = useState("")
  const me = useQuery({ queryKey: ["employeePortal", "me"], queryFn: api.employeePortal.me })
  const balance = useQuery({ queryKey: ["employeePortal", "balance"], queryFn: api.employeePortal.balance })
  const movements = useQuery({ queryKey: ["employeePortal", "movements"], queryFn: api.employeePortal.movements })
  const settlementTickets = useQuery({ queryKey: ["employeePortal", "settlementTickets"], queryFn: api.employeePortal.settlementTickets })
  const options = useQuery({ queryKey: ["employeePortal", "options"], queryFn: api.employeePortal.options })
  const schedule = useQuery({ queryKey: ["employeePortal", "schedule"], queryFn: api.employeePortal.schedule })
  const form = useForm<EmployeeRequestFormInput, unknown, EmployeeRequestFormOutput>({
    resolver: zodResolver(employeeRequestSchema),
    defaultValues: { kind: "SALARY_ADVANCE", amount: 0, reason: "Personal" }
  })
  const codeForm = useForm({ defaultValues: { currentCode: "", newCode: "" } })
  const selectedKind = form.watch("kind")
  const values = form.watch()
  const beveragePrice = Number(options.data?.beveragePrice ?? 30)
  const isDrink = selectedKind === "DRINK"
  const requestAmount = isDrink ? beveragePrice : Number(values.amount || 0)
  const requestReason = values.reason?.trim() ?? ""
  const needsCustomReason = reasonType === "Otro"

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
    if (payload.kind !== "DRINK" && needsCustomReason && !customReason.trim()) {
      setRequestError("Describe el motivo personalizado")
      return
    }
    if (payload.kind !== "DRINK") {
      form.setValue("reason", resolveRequestReason(), { shouldDirty: true, shouldValidate: true })
    }
    setMessage(null)
    setRequestError(null)
    setConfirming(true)
  }

  const resolveRequestReason = () => {
    if (reasonType === "Otro") return `Otro: ${customReason.trim()}`
    return reasonType
  }

  const selectRequestReason = (reason: (typeof quickRequestReasons)[number]) => {
    setReasonType(reason)
    if (reason !== "Otro") {
      setCustomReason("")
      form.setValue("reason", reason, { shouldDirty: true, shouldValidate: true })
    } else {
      form.setValue("reason", customReason.trim() ? `Otro: ${customReason.trim()}` : "Otro", { shouldDirty: true, shouldValidate: true })
    }
    setConfirming(false)
    setRequestError(null)
  }

  const updateCustomReason = (value: string) => {
    setCustomReason(value)
    form.setValue("reason", value.trim() ? `Otro: ${value.trim()}` : "", { shouldDirty: true, shouldValidate: true })
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
      setReasonType("Personal")
      setCustomReason("")
      form.reset({ kind: "SALARY_ADVANCE", amount: 0, reason: "Personal" })
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
  const registerAttendance = useMutation({
    mutationFn: async (pin: string) => {
      if (!/^\d{6}$/.test(pin)) throw new Error("Ingresa tu PIN de 6 dígitos.")

      setAttendanceMessage("Validando PIN...")
      const verification = await api.timeClock.verifyMobileEmployeeCode(pin)
      const type = verification.attendance.nextAction
      if (!verification.attendance.allowedActions.includes(type)) {
        throw new Error("No hay una acción de asistencia disponible.")
      }
      setAttendancePreview(verification)

      setAttendanceMessage("Obteniendo ubicación GPS...")
      const location = await getCurrentMobileLocation()

      setAttendanceMessage("Tomando evidencia...")
      const photo = await captureAttendancePhoto()

      setAttendanceMessage("Guardando asistencia...")
      const result = await api.timeClock.registerMobileEntry({ employeeCode: pin, type, photo, ...location })
      return { result, type, verification }
    },
    onSuccess: async ({ result, type, verification }) => {
      const distance = Math.round(result.location.distanceFromBranch)
      setAttendancePin("")
      setAttendancePreview(null)
      setAttendanceMessage(`${attendanceActionLabels[type]} listo para ${verification.employee.fullName}. Distancia: ${distance}m.`)
      await queryClient.invalidateQueries({ queryKey: ["employeePortal"] })
    },
    onError: (err: Error) => setAttendanceMessage(err.message)
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
          <img src={fatboyLogo} alt="Fatboy" style={{ height: '90%', maxHeight: '44px', objectFit: 'contain' }} className="w-auto opacity-95 filter drop-shadow-[0_0_10px_rgba(0,229,255,0.25)]" />
        </div>
        <button
          className="rounded-full border border-white/10 bg-white/5 text-foreground hover:bg-white/10 hover:border-white/20 w-10 h-10 flex items-center justify-center cursor-pointer transition-all duration-200 backdrop-blur-sm"
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
        <div className="employee-confirm-backdrop sm:items-center" role="dialog" aria-modal="true" onClick={() => setAccountOpen(false)}>
          <div className="employee-confirm-modal" style={{ maxWidth: '26rem' }} onClick={(event) => event.stopPropagation()}>
            {/* Profile Header */}
            <div style={{ padding: '1.25rem', borderBottom: '1px solid rgb(var(--surface-line) / 0.2)', background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.06), rgba(168, 85, 247, 0.05))' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex items-center gap-3">
                  <div className="employee-avatar-ring" style={{ width: '3.25rem', height: '3.25rem', fontSize: '1.1rem' }}>
                    {me.data?.fullName ? getInitials(me.data.fullName) : "E"}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-base font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif', color: 'hsl(var(--foreground))' }}>{me.data?.fullName ?? "Empleado"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <UserRound style={{ width: 11, height: 11, opacity: 0.7 }} />
                      {me.data?.position ?? "Puesto"}
                    </div>
                  </div>
                </div>
                <button className="h-9 w-9 rounded-full hover:bg-white/10 flex items-center justify-center border-none bg-transparent cursor-pointer text-muted-foreground transition-colors" onClick={() => setAccountOpen(false)} aria-label="Cerrar">
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>
            </div>

            {/* Change PIN Form */}
            <form className="p-4 space-y-3" onSubmit={codeForm.handleSubmit((values) => changeCode.mutate(values))}>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(0, 229, 255, 0.8)', letterSpacing: '0.08em' }}>
                <KeyRound className="h-3.5 w-3.5" />
                Cambiar PIN privado
              </div>
              <input className="form-input h-12 rounded-xl" placeholder="Código PIN actual" type="password" inputMode="numeric" maxLength={6} {...codeForm.register("currentCode")} />
              <input className="form-input h-12 rounded-xl" placeholder="Nuevo código PIN" type="password" inputMode="numeric" maxLength={6} {...codeForm.register("newCode")} />
              <button className="employee-request-submit w-full" disabled={changeCode.isPending} type="submit">
                {changeCode.isPending ? "Actualizando PIN..." : "Actualizar PIN"}
              </button>
              {codeMessage && <div className="text-xs text-center mt-1" style={{ color: codeMessage === 'Código actualizado' ? '#86efac' : '#fca5a5' }}>{codeMessage}</div>}
            </form>

            {/* Logout Button */}
            <div style={{ padding: '0 1rem 1.125rem' }}>
              <button
                className="h-12 w-full rounded-xl hover:bg-red-500/8 border border-red-500/20 bg-transparent text-red-400/80 hover:text-red-400 transition-all flex items-center justify-center gap-2 cursor-pointer font-bold text-sm"
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
        </div>
      )}

      {/* Main Page Area */}
      <div className="mx-auto max-w-md space-y-4 p-4 pt-3 pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
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
                    <UserRound style={{ color: '#00e5ff' }} />
                    <span>{me.data?.position ?? "Puesto"}</span>
                  </div>
                  <div className="employee-meta-item">
                    <Building2 style={{ color: '#00e5ff' }} />
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

            <EmployeeScheduleCard schedule={schedule.data} />

            <PortalMovementList compact title="Últimos Movimientos" movements={recentMovements} />
          </>
        )}

        {activeTab === "attendance" && (
          <EmployeeAttendanceCard
            attendanceMessage={attendanceMessage}
            attendancePin={attendancePin}
            attendancePreview={attendancePreview}
            isError={registerAttendance.isError}
            isPending={registerAttendance.isPending}
            onPinChange={(value) => {
              setAttendancePin(value.replace(/\D/g, "").slice(0, 6))
              setAttendanceMessage(null)
              setAttendancePreview(null)
            }}
            onSubmit={() => registerAttendance.mutate(attendancePin)}
          />
        )}

        {activeTab === "request" && (
          <section className="employee-request-panel">
            <div className="employee-request-hero">
              <div className="employee-request-kicker">
                <Sparkles style={{ width: 14, height: 14 }} />
                Solicitud interna
              </div>
              <h2>Solicitar adelanto</h2>
              <p>Elige tipo, monto y motivo en un solo flujo. Antes de enviar verás una confirmación.</p>
            </div>

            <form
              className="employee-request-form"
              noValidate
              onSubmit={form.handleSubmit(prepareRequestConfirmation, handleInvalidRequest)}
            >
              <div className="employee-request-section">
                <div className="employee-request-section-head">
                  <span>Tipo</span>
                  <strong>{movementLabels[selectedKind as MovementKind]}</strong>
                </div>
                <div className="employee-action-grid premium">
                  {employeeRequestKinds.map((k) => {
                    const active = selectedKind === k
                    const Icon = k === "SALARY_ADVANCE" ? Banknote : k === "DRINK" ? WalletCards : Building2
                    return (
                      <button
                        key={k}
                        type="button"
                        className={`employee-action-btn premium ${active ? "active" : ""}`}
                        onClick={() => {
                          form.setValue("kind", k as EmployeeRequestFormInput["kind"])
                          setConfirming(false)
                          setRequestError(null)
                        }}
                      >
                        <Icon />
                        <span className="employee-action-label">{movementLabels[k]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="employee-request-section">
                <div className="employee-request-section-head">
                  <span>{isDrink ? "Consumo" : "Monto"}</span>
                  <strong>{money.format(Number.isFinite(requestAmount) ? requestAmount : 0)}</strong>
                </div>
                {isDrink ? (
                  <div className="employee-request-readonly">
                    <span>Bebida consumida</span>
                    <strong>{money.format(beveragePrice)}</strong>
                  </div>
                ) : (
                  <div className="employee-amount-input-wrap">
                    <span>$</span>
                    <input
                      className="employee-amount-input"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      {...form.register("amount", {
                        onChange: () => {
                          setConfirming(false)
                          setRequestError(null)
                        }
                      })}
                    />
                  </div>
                )}
              </div>

              {!isDrink && (
                <div className="employee-request-section">
                  <div className="employee-request-section-head">
                    <span>Motivo</span>
                    <strong>{needsCustomReason ? "Personalizado" : reasonType}</strong>
                  </div>
                  <div className="employee-reason-segment">
                    {quickRequestReasons.map((reason) => (
                      <button
                        key={reason}
                        className={reasonType === reason ? "active" : ""}
                        type="button"
                        onClick={() => selectRequestReason(reason)}
                      >
                        {reason === "Emergencia" && <AlertTriangle style={{ width: 13, height: 13 }} />}
                        {reason}
                      </button>
                    ))}
                  </div>
                  {needsCustomReason && (
                    <textarea
                      className="employee-reason-textarea"
                      placeholder="Describe brevemente tu motivo personalizado..."
                      value={customReason}
                      onChange={(event) => updateCustomReason(event.target.value)}
                    />
                  )}
                </div>
              )}

                {requestError && (
                  <div className="employee-request-error">
                    {requestError}
                  </div>
                )}
                
                <button className="employee-request-submit" disabled={create.isPending} type="submit">
                  {create.isPending ? "Procesando..." : isDrink ? "Revisar consumo de bebida" : "Continuar"}
                </button>
                <p className="employee-request-footnote">
                  *Las solicitudes se envían al panel de administración para su aprobación y posterior deducción de nómina.
                </p>
                {message && (
                  <div className="employee-request-message">
                    {message}
                  </div>
                )}
              </form>
          </section>
        )}

        {confirming && activeTab === "request" && (
          <div className="employee-confirm-backdrop" role="dialog" aria-modal="true" onClick={() => setConfirming(false)}>
            <div className="employee-confirm-modal" onClick={(event) => event.stopPropagation()}>
              <div className="employee-confirm-hero">
                <div className="employee-confirm-icon">
                  <CheckCircle2 style={{ width: 22, height: 22 }} />
                </div>
                <div>
                  <div className="employee-confirm-title">{isDrink ? "Confirmar consumo" : "Confirmar solicitud"}</div>
                  <p>
                  {isDrink
                    ? "Confirma que estás solicitando el descuento por esta bebida consumida."
                    : "Verifica que los datos sean correctos antes de enviarla."}
                  </p>
                </div>
              </div>
              <div className="employee-confirm-summary">
                <DetailLine label={isDrink ? "Concepto" : "Categoría de adelanto"} value={movementLabels[values.kind as MovementKind]} />
                <DetailLine label="Importe total" value={money.format(Number.isFinite(requestAmount) ? requestAmount : 0)} />
                {!isDrink && <DetailLine label="Motivo especificado" value={requestReason || "Sin motivo"} />}
              </div>
              <div className="employee-confirm-actions">
                <button className="btn-secondary" type="button" onClick={() => setConfirming(false)}>
                  Cancelar
                </button>
                <button
                  className="btn-primary"
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
  activeTab: EmployeeTab
  onTabChange: (tab: EmployeeTab) => void
  style?: React.CSSProperties
}) {
  const items = [
    { id: "home" as const, label: "Inicio", icon: LayoutDashboard },
    { id: "attendance" as const, label: "Asistencia", icon: MapPin },
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

const dayLabels: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  0: "Domingo"
}

function EmployeeScheduleCard({ schedule }: { schedule: Omit<EmployeeWorkSchedule, "employee"> | undefined }) {
  if (!schedule) return null

  const sortedDays = [...(schedule.days ?? [])].sort((a, b) => {
    const valA = a.dayOfWeek === 0 ? 7 : a.dayOfWeek
    const valB = b.dayOfWeek === 0 ? 7 : b.dayOfWeek
    return valA - valB
  })

  return (
    <section className="employee-request-panel animate-in fade-in slide-in-from-bottom-3 duration-300">
      <div className="employee-request-hero">
        <div className="employee-request-kicker">
          <CalendarDays style={{ width: 14, height: 14 }} />
          Horario de Trabajo
        </div>
        <h2>Mi Horario Semanal</h2>
        <p>Consulta tus turnos asignados y días de descanso programados por administración.</p>
      </div>

      <div className="p-4 space-y-2">
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
          <div className="divide-y divide-white/5">
            {sortedDays.map((day) => (
              <div key={day.dayOfWeek} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="font-bold text-[#e2e8f0]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  {dayLabels[day.dayOfWeek]}
                </span>
                {day.enabled ? (
                  <span className="font-mono font-semibold text-[#00e5ff] bg-[#00e5ff]/5 border border-[#00e5ff]/20 px-3 py-1 rounded-lg text-xs">
                    {day.start} - {day.end}
                  </span>
                ) : (
                  <span className="text-muted-foreground bg-white/5 border border-white/10 px-3 py-1 rounded-lg text-xs font-semibold">
                    Descanso
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {schedule.lateGraceMinutes > 0 && (
          <div className="flex items-center gap-2 mt-2 px-1 text-[11px] text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00e5ff]" />
            <span>Tolerancia de entrada: <strong>{schedule.lateGraceMinutes} minutos</strong>.</span>
          </div>
        )}
      </div>
    </section>
  )
}

function EmployeeAttendanceCard({
  attendanceMessage,
  attendancePin,
  attendancePreview,
  isError,
  isPending,
  onPinChange,
  onSubmit
}: {
  attendanceMessage: string | null
  attendancePin: string
  attendancePreview: TimeClockEmployeeVerification | null
  isError: boolean
  isPending: boolean
  onPinChange: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <section className="employee-request-panel">
      <div className="employee-request-hero">
        <div className="employee-request-kicker">
          <MapPin style={{ width: 14, height: 14 }} />
          Asistencia GPS
        </div>
        <h2>Registrar asistencia</h2>
        <p>Confirma tu PIN para registrar la siguiente acción disponible con ubicación y evidencia.</p>
      </div>

      <div className="employee-request-form">
        <div className="employee-request-section">
          <div className="employee-request-section-head">
            <span>Validación</span>
            <strong>PIN privado</strong>
          </div>
          <input
            className="form-input h-12 rounded-xl text-center font-mono text-lg tracking-[0.3em]"
            inputMode="numeric"
            maxLength={6}
            placeholder="••••••"
            type="password"
            value={attendancePin}
            onChange={(event) => onPinChange(event.target.value)}
          />
        </div>

        {attendancePreview && (
          <div className="employee-request-readonly">
            <span>{attendancePreview.attendance.statusLabel}</span>
            <strong>{attendanceActionLabels[attendancePreview.attendance.nextAction]}</strong>
          </div>
        )}

        {attendanceMessage && (
          <div className={isError ? "employee-request-error" : "employee-request-message"}>
            {attendanceMessage}
          </div>
        )}

        <button
          className="employee-request-submit"
          disabled={isPending}
          type="button"
          onClick={onSubmit}
        >
          {isPending ? "Registrando..." : "Registrar asistencia"}
        </button>
        <p className="employee-request-footnote">
          *El navegador pedirá permiso de ubicación y cámara para guardar la asistencia.
        </p>
      </div>
    </section>
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
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#00e5ff]">Recibo Digital</div>
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

function getCurrentMobileLocation() {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("Este dispositivo no permite obtener ubicación GPS."))
  }

  return new Promise<MobileLocation>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        })
      },
      (error) => {
        reject(new Error(error.code === error.PERMISSION_DENIED
          ? "Activa el permiso de ubicación para registrar asistencia."
          : "No se pudo obtener ubicación GPS. Intenta de nuevo."))
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    )
  })
}

async function captureAttendancePhoto() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este dispositivo no permite abrir la cámara desde el navegador.")
  }

  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
  const video = document.createElement("video")
  try {
    video.srcObject = stream
    video.muted = true
    video.playsInline = true
    await video.play()
    if (video.readyState < 2) await new Promise((resolve) => window.setTimeout(resolve, 250))
    if (video.readyState < 2) throw new Error("La cámara no está lista para capturar evidencia.")

    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82))
    if (!blob) throw new Error("No se pudo procesar la fotografía de evidencia.")
    return blob
  } finally {
    stream.getTracks().forEach((track) => track.stop())
    video.srcObject = null
  }
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
