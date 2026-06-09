import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Camera, CheckCircle2, Clock3, Download, KeyRound, Plus, RefreshCw, RotateCw, Save, Wrench, X } from "lucide-react"
import { api } from "@/lib/api"
import type { AttendanceRow, Branch, TimeClockEntry, TimeClockEventType, User } from "@/types/domain"

const statusLabels: Record<AttendanceRow["status"], string> = {
  IN_SHIFT: "En turno",
  EXITED: "Salio",
  NO_SHOW: "Sin checar"
}

export function AttendanceAdmin({ user }: { user?: User }) {
  const queryClient = useQueryClient()
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [date, setDate] = useState(today)
  const [branchId, setBranchId] = useState("")
  const [employeeId, setEmployeeId] = useState("")
  const [deviceName, setDeviceName] = useState("")
  const [deviceBranchId, setDeviceBranchId] = useState("")
  const [requestDrafts, setRequestDrafts] = useState<Record<string, { name: string; branchId: string }>>({})
  const [setupToken, setSetupToken] = useState<string | null>(null)
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

  return (
    <div className="space-y-4">
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

      <div className="admin-two-column">
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

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
