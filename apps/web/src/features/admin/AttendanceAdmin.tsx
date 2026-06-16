import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CalendarDays, Camera, CheckCircle2, Clock3, Download, History, KeyRound, Plus, RefreshCw, RotateCw, Save, Trash2, UserRound, Wrench, X } from "lucide-react"
import { api } from "@/lib/api"
import type { AttendanceRow, Branch, EmployeeTimeClockHistoryDay, TimeClockDevice, TimeClockEntry, TimeClockEventType, User } from "@/types/domain"

const statusLabels: Record<AttendanceRow["status"], string> = {
  IN_SHIFT: "En turno",
  EXITED: "Salio",
  NO_SHOW: "Sin checar"
}

type AttendancePanel = "day" | "history" | "devices" | "adjustments"

export function AttendanceAdmin({ user }: { user?: User }) {
  const queryClient = useQueryClient()
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const defaultHistoryFrom = useMemo(() => addDays(today, -29), [today])
  const [date, setDate] = useState(today)
  const [branchId, setBranchId] = useState("")
  const [employeeId, setEmployeeId] = useState("")
  const [historyFrom, setHistoryFrom] = useState(defaultHistoryFrom)
  const [historyTo, setHistoryTo] = useState(today)
  const [deviceName, setDeviceName] = useState("")
  const [deviceBranchId, setDeviceBranchId] = useState("")
  const [requestDrafts, setRequestDrafts] = useState<Record<string, { name: string; branchId: string }>>({})
  const [setupToken, setSetupToken] = useState<string | null>(null)
  const [activePanel, setActivePanel] = useState<AttendancePanel>("day")
  const [adjustment, setAdjustment] = useState({
    employeeId: "",
    branchId: "",
    type: "ENTRY" as TimeClockEventType,
    occurredAt: "",
    reason: "",
    notes: ""
  })
  const [message, setMessage] = useState<string | null>(null)

  const branches = useQuery({ queryKey: ["branches"], queryFn: () => api.branches() })
  const employees = useQuery({ queryKey: ["employees", "attendance"], queryFn: () => api.employees() })
  const attendance = useQuery({
    queryKey: ["attendance", date, branchId, employeeId],
    queryFn: () => api.adminTimeClock.attendance({ date, branchId, employeeId })
  })
  const devices = useQuery({ queryKey: ["time-clock-devices"], queryFn: api.adminTimeClock.devices })
  const deviceRequests = useQuery({
    queryKey: ["time-clock-device-requests"],
    queryFn: api.adminTimeClock.deviceRequests,
    refetchInterval: 5000
  })
  const adjustments = useQuery({
    queryKey: ["attendance-adjustments", branchId, employeeId],
    queryFn: () => api.adminTimeClock.adjustments({ branchId, employeeId })
  })

  const activeBranches = branches.data ?? []
  const scopedEmployees = (employees.data ?? []).filter((employee) => {
    if (branchId) return employee.branch.id === branchId
    return true
  })
  const employeeHistory = useQuery({
    queryKey: ["employee-time-clock-history", employeeId, historyFrom, historyTo],
    queryFn: () => api.adminTimeClock.employeeHistory(employeeId, { from: historyFrom, to: historyTo }),
    enabled: Boolean(employeeId)
  })
  const attendanceRows = attendance.data ?? []
  const inShiftCount = attendanceRows.filter((row) => row.status === "IN_SHIFT").length
  const exitedCount = attendanceRows.filter((row) => row.status === "EXITED").length
  const noShowCount = attendanceRows.filter((row) => row.status === "NO_SHOW").length

  const createDevice = useMutation({
    mutationFn: () => api.adminTimeClock.createDevice({ name: deviceName, branchId: deviceBranchId }),
    onSuccess: async (device) => {
      setSetupToken(device.setupToken ?? null)
      setDeviceName("")
      setDeviceBranchId("")
      await queryClient.invalidateQueries({ queryKey: ["time-clock-devices"] })
    },
    onError: (error: Error) => setMessage(error.message)
  })

  const updateDevice = useMutation({
    mutationFn: ({ id, active, rotateToken }: { id: string; active?: boolean; rotateToken?: boolean }) =>
      api.adminTimeClock.updateDevice(id, { active, rotateToken }),
    onSuccess: async (device) => {
      if (device.setupToken) setSetupToken(device.setupToken)
      await queryClient.invalidateQueries({ queryKey: ["time-clock-devices"] })
    },
    onError: (error: Error) => setMessage(error.message)
  })

  const purgeDevice = useMutation({
    mutationFn: (device: TimeClockDevice) => api.adminTimeClock.purgeDeviceForDeveloper(device.id),
    onSuccess: async (summary) => {
      setMessage(`Dispositivo eliminado. Registros desvinculados: ${summary.entriesDetached + summary.sessionsDetached}`)
      await queryClient.invalidateQueries({ queryKey: ["time-clock-devices"] })
      await queryClient.invalidateQueries({ queryKey: ["time-clock-device-requests"] })
      await queryClient.invalidateQueries({ queryKey: ["attendance"] })
    },
    onError: (error: Error) => setMessage(error.message)
  })

  const approveRequest = useMutation({
    mutationFn: ({ id, name, branchId }: { id: string; name: string; branchId: string }) =>
      api.adminTimeClock.approveDeviceRequest(id, { name, branchId }),
    onSuccess: async () => {
      setMessage("Dispositivo autorizado")
      await queryClient.invalidateQueries({ queryKey: ["time-clock-device-requests"] })
      await queryClient.invalidateQueries({ queryKey: ["time-clock-devices"] })
    },
    onError: (error: Error) => setMessage(error.message)
  })

  const rejectRequest = useMutation({
    mutationFn: (id: string) => api.adminTimeClock.rejectDeviceRequest(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["time-clock-device-requests"] })
    },
    onError: (error: Error) => setMessage(error.message)
  })

  const createAdjustment = useMutation({
    mutationFn: () => api.adminTimeClock.createAdjustment(adjustment),
    onSuccess: async () => {
      setMessage("Correccion registrada")
      setAdjustment({ employeeId: "", branchId: "", type: "ENTRY", occurredAt: "", reason: "", notes: "" })
      await queryClient.invalidateQueries({ queryKey: ["attendance"] })
      await queryClient.invalidateQueries({ queryKey: ["attendance-adjustments"] })
      await queryClient.invalidateQueries({ queryKey: ["employee-time-clock-history"] })
    },
    onError: (error: Error) => setMessage(error.message)
  })

  async function exportRows() {
    const blob = await api.adminTimeClock.exportAttendance({ date, branchId, employeeId })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `asistencia-${date}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function confirmDevicePurge(device: TimeClockDevice) {
    const confirmation = window.prompt(`Borrado definitivo del dispositivo ${device.name}. Escribe BORRAR para confirmar.`)
    if (confirmation === "BORRAR") {
      purgeDevice.mutate(device)
    }
  }

  return (
    <div className="space-y-4">
      <div className="attendance-dashboard-shell">
        <div className="attendance-dashboard-head">
          <div>
            <div className="admin-card-title">
              <Clock3 style={{ width: 15, height: 15, color: "#00e5ff" }} />
              Dashboard de asistencia
            </div>
          </div>
          <div className="attendance-dashboard-tabs" role="tablist" aria-label="Vistas de asistencia">
            <button className={`attendance-tab ${activePanel === "day" ? "active" : ""}`} type="button" onClick={() => setActivePanel("day")}>
              <Clock3 style={{ width: 13, height: 13 }} />
              Dia
            </button>
            <button className={`attendance-tab ${activePanel === "history" ? "active" : ""}`} type="button" onClick={() => setActivePanel("history")}>
              <History style={{ width: 13, height: 13 }} />
              Historial
            </button>
            <button className={`attendance-tab ${activePanel === "devices" ? "active" : ""}`} type="button" onClick={() => setActivePanel("devices")}>
              <KeyRound style={{ width: 13, height: 13 }} />
              Dispositivos
            </button>
            <button className={`attendance-tab ${activePanel === "adjustments" ? "active" : ""}`} type="button" onClick={() => setActivePanel("adjustments")}>
              <Wrench style={{ width: 13, height: 13 }} />
              Correcciones
            </button>
          </div>
        </div>
        <div className="attendance-dashboard-metrics">
          <HistoryMetric label="Empleados visibles" value={attendanceRows.length} />
          <HistoryMetric label="En turno" value={inShiftCount} />
          <HistoryMetric label="Salieron" value={exitedCount} />
          <HistoryMetric label="Sin checar" value={noShowCount} />
          <HistoryMetric label="Tablets activas" value={(devices.data ?? []).filter((device) => device.active).length} />
          <HistoryMetric label="Solicitudes" value={deviceRequests.data?.length ?? 0} />
        </div>
      </div>

      {activePanel === "day" && (
      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">
            <Clock3 style={{ width: 14, height: 14, color: "#00e5ff" }} />
            Asistencia del dia
          </div>
          <button className="btn-secondary" type="button" onClick={exportRows}>
            <Download style={{ width: 14, height: 14 }} />
            Exportar Excel
          </button>
        </div>
        <div className="admin-card-body">
          <div className="admin-form-row">
            <input className="form-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <select className="form-select" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">Todas las sucursales</option>
              {activeBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <select className="form-select" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              <option value="">Todos los empleados</option>
              {scopedEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.fullName}</option>
              ))}
            </select>
          </div>

          <div className="attendance-table">
            {(attendance.data ?? []).map((row) => (
              <div key={row.employee.id} className="attendance-row">
                <div className="attendance-main">
                  <strong>{row.employee.fullName}</strong>
                  <span>{row.employee.position} · {row.branch.name}</span>
                </div>
                <span className={`attendance-status ${row.status.toLowerCase()}`}>{statusLabels[row.status]}</span>
                <div className="attendance-times">
                  <span>Entrada: {row.sessions[0]?.startEntry?.localTime ?? "--"}</span>
                  <span>Salida: {row.sessions[row.sessions.length - 1]?.endEntry?.localTime ?? "--"}</span>
                  <span>{row.sessions[row.sessions.length - 1]?.totalMinutes ?? 0} min</span>
                </div>
                <div className="attendance-evidence">
                  {row.entries.map((entry) => (
                    <EvidenceButton key={entry.id} entry={entry} />
                  ))}
                </div>
              </div>
            ))}
            {attendance.isLoading && <div className="status-empty">Cargando asistencia...</div>}
            {!attendance.isLoading && !attendance.data?.length && <div className="status-empty">Sin empleados para los filtros seleccionados.</div>}
          </div>
        </div>
      </div>
      )}

      {activePanel === "history" && (
      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">
            <History style={{ width: 14, height: 14, color: "#67e8f9" }} />
            Historial por empleado
          </div>
        </div>
        <div className="admin-card-body">
          <div className="admin-form-row">
            <select className="form-select" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              <option value="">Selecciona empleado</option>
              {scopedEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.fullName}</option>
              ))}
            </select>
            <input className="form-input" type="date" value={historyFrom} onChange={(event) => setHistoryFrom(event.target.value)} />
            <input className="form-input" type="date" value={historyTo} onChange={(event) => setHistoryTo(event.target.value)} />
          </div>

          {!employeeId && <div className="status-empty">Selecciona un empleado para ver su ficha e historial de entradas, salidas, faltas y correcciones.</div>}
          {employeeHistory.isLoading && <div className="status-empty">Cargando historial del empleado...</div>}
          {employeeHistory.error && <div className="status-empty compact-error">{employeeHistory.error.message}</div>}
          {employeeHistory.data && (
            <div className="employee-attendance-history">
              <div className="employee-history-profile">
                <div className="employee-history-avatar">
                  <UserRound style={{ width: 22, height: 22 }} />
                </div>
                <div className="employee-history-main">
                  <strong>{employeeHistory.data.employee.fullName}</strong>
                  <span>{employeeHistory.data.employee.position} · {employeeHistory.data.employee.branch.name}</span>
                  <span>{employeeHistory.data.employee.phone} · {employeeHistory.data.employee.active ? "Activo" : "Inactivo"}</span>
                </div>
                <span className="attendance-status no_show">Retardo no evaluado</span>
              </div>

              <div className="employee-history-kpis">
                <HistoryMetric label="Dias con registro" value={employeeHistory.data.summary.presentDays} />
                <HistoryMetric label="Sin checar" value={employeeHistory.data.summary.noShowDays} />
                <HistoryMetric label="Entradas" value={employeeHistory.data.summary.entryCount} />
                <HistoryMetric label="Salidas" value={employeeHistory.data.summary.exitCount} />
                <HistoryMetric label="Manual" value={employeeHistory.data.summary.manualCount} />
                <HistoryMetric label="Horas" value={formatHours(employeeHistory.data.summary.totalMinutes)} />
              </div>

              <div className="employee-history-grid">
                <div className="employee-history-panel">
                  <div className="employee-history-panel-head">
                    <CalendarDays style={{ width: 13, height: 13 }} />
                    Dias del rango
                  </div>
                  <div className="employee-history-days">
                    {employeeHistory.data.days.map((day) => (
                      <HistoryDayRow key={day.date} day={day} />
                    ))}
                  </div>
                </div>

                <div className="employee-history-panel">
                  <div className="employee-history-panel-head">
                    <Clock3 style={{ width: 13, height: 13 }} />
                    Registros capturados
                  </div>
                  <div className="employee-history-entries">
                    {employeeHistory.data.entries.map((entry) => (
                      <div key={entry.id} className="employee-history-entry">
                        <div>
                          <strong>{entry.type === "ENTRY" ? "Entrada" : "Salida"} · {entry.localDate} {entry.localTime}</strong>
                          <span>{entry.status === "MANUAL" ? "Manual" : "Checador"} · {entry.device?.name ?? entry.createdByUser?.fullName ?? "Sin dispositivo"} · {entry.branch?.name ?? "Sucursal"}</span>
                          {entry.notes && <span>{entry.notes}</span>}
                        </div>
                        <EvidenceButton entry={entry} />
                      </div>
                    ))}
                    {!employeeHistory.data.entries.length && <div className="status-empty">Sin entradas ni salidas en este rango.</div>}
                  </div>
                </div>
              </div>

              <div className="employee-history-panel">
                <div className="employee-history-panel-head">
                  <Wrench style={{ width: 13, height: 13 }} />
                  Correcciones registradas
                </div>
                <div className="attendance-adjustment-list">
                  {employeeHistory.data.adjustments.map((item) => (
                    <div key={item.id}>
                      <strong>{item.action} · {formatDateTime(item.createdAt)}</strong>
                      <span>{item.reason} · {item.adjustedBy?.fullName ?? "Usuario"}</span>
                    </div>
                  ))}
                  {!employeeHistory.data.adjustments.length && <div className="status-empty">Sin correcciones para este empleado.</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {activePanel === "devices" && (
        <div className="admin-card">
          <div className="admin-card-header">
            <div className="admin-card-title">
              <KeyRound style={{ width: 14, height: 14, color: "#fbbf24" }} />
              Dispositivos autorizados
            </div>
          </div>
          <div className="admin-card-body space-y-3">
            <div className="attendance-pending-box">
              <div className="attendance-pending-head">
                <strong>Solicitudes pendientes</strong>
                <span>{deviceRequests.data?.length ?? 0}</span>
              </div>
              <div className="settings-list-grid">
                {deviceRequests.data?.map((request) => {
                  const draft = requestDrafts[request.id] ?? {
                    name: request.deviceName ?? `Tablet ${request.code}`,
                    branchId: user?.role === "ENCARGADO" && user.branch?.id ? user.branch.id : ""
                  }
                  const canApprove = draft.name.trim().length >= 2 && Boolean(draft.branchId) && !approveRequest.isPending
                  return (
                    <div key={request.id} className="settings-list-card attendance-request-card">
                      <div className="settings-list-main">
                        <div className="attendance-request-code">{request.code}</div>
                        <div className="settings-list-meta">
                          Token ****{request.requestTokenLast4 ?? "----"} · {request.requestIp ?? "IP no disponible"}
                        </div>
                      </div>
                      <input
                        className="form-input"
                        placeholder="Nombre de tablet"
                        value={draft.name}
                        onChange={(event) =>
                          setRequestDrafts((current) => ({
                            ...current,
                            [request.id]: { ...draft, name: event.target.value }
                          }))
                        }
                      />
                      <select
                        className="form-select"
                        value={draft.branchId}
                        onChange={(event) =>
                          setRequestDrafts((current) => ({
                            ...current,
                            [request.id]: { ...draft, branchId: event.target.value }
                          }))
                        }
                      >
                        <option value="">Sucursal</option>
                        {visibleBranchesForUser(activeBranches, user).map((branch) => (
                          <option key={branch.id} value={branch.id}>{branch.name}</option>
                        ))}
                      </select>
                      <div className="settings-row-actions">
                        <button
                          className="btn-icon"
                          type="button"
                          title="Autorizar"
                          disabled={!canApprove}
                          onClick={() => approveRequest.mutate({ id: request.id, name: draft.name, branchId: draft.branchId })}
                        >
                          <CheckCircle2 style={{ width: 13, height: 13 }} />
                        </button>
                        <button
                          className="btn-icon danger"
                          type="button"
                          title="Rechazar"
                          disabled={rejectRequest.isPending}
                          onClick={() => rejectRequest.mutate(request.id)}
                        >
                          <X style={{ width: 13, height: 13 }} />
                        </button>
                      </div>
                    </div>
                  )
                })}
                {!deviceRequests.data?.length && <div className="status-empty">Sin tablets esperando autorizacion.</div>}
              </div>
            </div>

            <div className="admin-form-row">
              <input className="form-input" placeholder="Nombre de tablet" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} />
              <select className="form-select" value={deviceBranchId} onChange={(event) => setDeviceBranchId(event.target.value)}>
                <option value="">Sucursal</option>
                {visibleBranchesForUser(activeBranches, user).map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
              <button className="btn-primary" type="button" disabled={!deviceName || !deviceBranchId || createDevice.isPending} onClick={() => createDevice.mutate()}>
                <Plus style={{ width: 14, height: 14 }} />
                Crear
              </button>
            </div>

            {setupToken && (
              <div className="attendance-token-box">
                <span>Token de configuracion</span>
                <code>{setupToken}</code>
                <a href={`/checador?token=${encodeURIComponent(setupToken)}`} target="_blank" rel="noreferrer">Abrir checador</a>
              </div>
            )}

            <div className="settings-list-grid">
              {devices.data?.map((device) => (
                <div key={device.id} className="settings-list-card">
                  <div className="settings-list-main">
                    <div className="settings-list-title">{device.name}</div>
                    <div className="settings-list-meta">{device.branch.name} · token ****{device.tokenLast4}</div>
                  </div>
                  <span className={device.active ? "badge-status badge-authorized" : "badge-status badge-canceled"}>
                    {device.active ? "Activo" : "Inactivo"}
                  </span>
                  <div className="settings-row-actions">
                    <button className="btn-icon" type="button" title="Rotar token" onClick={() => updateDevice.mutate({ id: device.id, rotateToken: true })}>
                      <RotateCw style={{ width: 13, height: 13 }} />
                    </button>
                    <button className="btn-icon" type="button" title={device.active ? "Desactivar" : "Activar"} onClick={() => updateDevice.mutate({ id: device.id, active: !device.active })}>
                      <RefreshCw style={{ width: 13, height: 13 }} />
                    </button>
                    {user?.role === "ADMINISTRADOR" && (
                      <button
                        className="btn-icon danger"
                        type="button"
                        title="Purga dev"
                        disabled={purgeDevice.isPending}
                        onClick={() => confirmDevicePurge(device)}
                      >
                        <Trash2 style={{ width: 13, height: 13 }} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {purgeDevice.error && <div className="status-empty compact-error">{purgeDevice.error.message}</div>}
          </div>
        </div>
      )}

      {activePanel === "adjustments" && (
        <div className="admin-card">
          <div className="admin-card-header">
            <div className="admin-card-title">
              <Wrench style={{ width: 14, height: 14, color: "#a855f7" }} />
              Correccion manual
            </div>
          </div>
          <div className="admin-card-body space-y-3">
            <select className="form-select" value={adjustment.branchId} onChange={(event) => setAdjustment((current) => ({ ...current, branchId: event.target.value, employeeId: "" }))}>
              <option value="">Sucursal del empleado</option>
              {visibleBranchesForUser(activeBranches, user).map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <select className="form-select" value={adjustment.employeeId} onChange={(event) => setAdjustment((current) => ({ ...current, employeeId: event.target.value }))}>
              <option value="">Empleado</option>
              {(employees.data ?? [])
                .filter((employee) => !adjustment.branchId || employee.branch.id === adjustment.branchId)
                .map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.fullName}</option>
                ))}
            </select>
            <div className="admin-form-row">
              <select className="form-select" value={adjustment.type} onChange={(event) => setAdjustment((current) => ({ ...current, type: event.target.value as TimeClockEventType }))}>
                <option value="ENTRY">Entrada</option>
                <option value="EXIT">Salida</option>
              </select>
              <input className="form-input" type="datetime-local" value={adjustment.occurredAt} onChange={(event) => setAdjustment((current) => ({ ...current, occurredAt: event.target.value }))} />
            </div>
            <textarea className="form-textarea" placeholder="Motivo obligatorio" value={adjustment.reason} onChange={(event) => setAdjustment((current) => ({ ...current, reason: event.target.value }))} />
            <input className="form-input" placeholder="Notas internas" value={adjustment.notes} onChange={(event) => setAdjustment((current) => ({ ...current, notes: event.target.value }))} />
            <button className="btn-primary modal-submit" type="button" disabled={!adjustment.employeeId || adjustment.reason.trim().length < 5 || createAdjustment.isPending} onClick={() => createAdjustment.mutate()}>
              <Save style={{ width: 14, height: 14 }} />
              Guardar correccion
            </button>
            {message && <div className="status-empty compact-error">{message}</div>}
            <div className="attendance-adjustment-list">
              {adjustments.data?.slice(0, 5).map((item) => (
                <div key={item.id}>
                  <strong>{item.employee?.fullName}</strong>
                  <span>{item.action} · {item.reason}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function HistoryMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="employee-history-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function HistoryDayRow({ day }: { day: EmployeeTimeClockHistoryDay }) {
  return (
    <div className="employee-history-day">
      <div className="employee-history-day-date">
        <strong>{day.date}</strong>
        <span>{day.entries.length} registros · {formatHours(day.totalMinutes)}</span>
      </div>
      <span className={`attendance-status ${day.status.toLowerCase()}`}>{statusLabels[day.status]}</span>
      <div className="employee-history-day-times">
        <span>Entrada {day.firstEntry?.localTime ?? "--"}</span>
        <span>Salida {day.lastExit?.localTime ?? "--"}</span>
        <span>Retardo no evaluado</span>
      </div>
    </div>
  )
}

function EvidenceButton({ entry }: { entry: TimeClockEntry }) {
  const [loading, setLoading] = useState(false)
  if (!entry.evidenceFileId) return null

  async function openEvidence() {
    if (!entry.evidenceFileId) return
    setLoading(true)
    try {
      const blob = await api.fileBlob(entry.evidenceFileId)
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank", "noopener,noreferrer")
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button className="btn-icon" type="button" title="Ver foto" onClick={openEvidence} disabled={loading}>
      <Camera style={{ width: 13, height: 13 }} />
    </button>
  )
}

function visibleBranchesForUser(branches: Branch[], user?: User) {
  if (user?.role === "ENCARGADO" && user.branch?.id) return branches.filter((branch) => branch.id === user.branch?.id)
  return branches
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function formatHours(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return `${hours}h ${String(remaining).padStart(2, "0")}m`
}

function formatDateTime(value?: string | null) {
  if (!value) return "--"
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value))
}
