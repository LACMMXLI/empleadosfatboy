import type { AppConfig, AttendanceAdjustment, AttendanceRow, AuditLog, Branch, DashboardSummary, Employee, FileAsset, Incident, IncidentStatus, Movement, MovementKind, MovementSettlementSummary, MovementSettlementTicket, Payroll, PayrollPreview, Role, TimeClockDevice, TimeClockDeviceRequest, TimeClockEntry, TimeClockEventType, User } from "@/types/domain"

const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "")

type LoginResponse = {
  token: string
  user: {
    id: string
    fullName: string
    email: string
    role: Role
    branch?: {
      id: string
      name: string
      code: string
    } | null
  }
}

export const session = {
  get token() {
    return localStorage.getItem("fatboy-ledger-token")
  },
  set token(value: string | null) {
    if (value) localStorage.setItem("fatboy-ledger-token", value)
    else localStorage.removeItem("fatboy-ledger-token")
  }
}

export const employeeSession = {
  get token() {
    return localStorage.getItem("fatboy-employee-portal-token")
  },
  set token(value: string | null) {
    if (value) localStorage.setItem("fatboy-employee-portal-token", value)
    else localStorage.removeItem("fatboy-employee-portal-token")
  }
}

export const timeClockDeviceSession = {
  get token() {
    return localStorage.getItem("fatboy-time-clock-device-token")
  },
  set token(value: string | null) {
    if (value) localStorage.setItem("fatboy-time-clock-device-token", value)
    else localStorage.removeItem("fatboy-time-clock-device-token")
  }
}

export const timeClockDeviceRequestSession = {
  get token() {
    return localStorage.getItem("fatboy-time-clock-device-request-token")
  },
  set token(value: string | null) {
    if (value) localStorage.setItem("fatboy-time-clock-device-request-token", value)
    else localStorage.removeItem("fatboy-time-clock-device-request-token")
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...options.headers
    }
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? "No se pudo completar la operacion")
  }

  return response.json() as Promise<T>
}

async function formRequest<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      ...(session.token ? { Authorization: `Bearer ${session.token}` } : {})
    },
    body: formData
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? "No se pudo completar la operacion")
  }

  return response.json() as Promise<T>
}

async function blobRequest(path: string): Promise<Blob> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      ...(session.token ? { Authorization: `Bearer ${session.token}` } : {})
    }
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? "No se pudo completar la operacion")
  }

  return response.blob()
}

async function employeeRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(employeeSession.token ? { Authorization: `Bearer ${employeeSession.token}` } : {}),
      ...options.headers
    }
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? "No se pudo completar la operacion")
  }

  return response.json() as Promise<T>
}

async function timeClockRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(timeClockDeviceSession.token ? { "X-Time-Clock-Device": timeClockDeviceSession.token } : {}),
      ...options.headers
    }
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? "No se pudo completar la operacion")
  }

  return response.json() as Promise<T>
}

async function timeClockFormRequest<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      ...(timeClockDeviceSession.token ? { "X-Time-Clock-Device": timeClockDeviceSession.token } : {})
    },
    body: formData
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? "No se pudo completar la operacion")
  }

  return response.json() as Promise<T>
}

export const api = {
  login(email: string, password: string) {
    return request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    })
  },
  me() {
    return request<User>("/auth/me")
  },
  dashboard() {
    return request<DashboardSummary>("/dashboard")
  },
  employees(q?: string, includeInactive = false) {
    const query = new URLSearchParams()
    if (q) query.set("q", q)
    if (includeInactive) query.set("includeInactive", "true")
    const params = query.toString()
    return request<Employee[]>(`/employees${params ? `?${params}` : ""}`)
  },
  createEmployee(payload: Record<string, unknown>) {
    return request<Employee>("/employees", { method: "POST", body: JSON.stringify(payload) })
  },
  updateEmployee(id: string, payload: Record<string, unknown>) {
    return request<Employee>(`/employees/${id}`, { method: "PATCH", body: JSON.stringify(payload) })
  },
  uploadFile(payload: {
    file: File
    module: "incidencias" | "empleados" | "checklists"
    entityId?: string
    branchId?: string
    type?: string
  }) {
    const formData = new FormData()
    formData.append("file", payload.file)
    formData.append("module", payload.module)
    if (payload.entityId) formData.append("entityId", payload.entityId)
    if (payload.branchId) formData.append("branchId", payload.branchId)
    if (payload.type) formData.append("type", payload.type)
    return formRequest<FileAsset>("/files/upload", formData)
  },
  fileUrl(id: string) {
    return `${API_URL}/files/${id}`
  },
  fileBlob(id: string) {
    return blobRequest(`/files/${id}`)
  },
  deleteFile(id: string) {
    return request<{ id: string; deleted: true }>(`/files/${id}`, { method: "DELETE" })
  },
  incidents(params?: Partial<{ status: IncidentStatus; employeeId: string; branchId: string; from: string; to: string; q: string }>) {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(params ?? {}).filter(([, value]) => Boolean(value))) as Record<string, string>
    ).toString()
    return request<Incident[]>(`/admin/incidents${query ? `?${query}` : ""}`)
  },
  createIncident(payload: { title: string; description: string; employeeId?: string; branchId?: string }) {
    return request<Incident>("/admin/incidents", { method: "POST", body: JSON.stringify(payload) })
  },
  incident(id: string) {
    return request<Incident>(`/admin/incidents/${id}`)
  },
  updateIncidentStatus(id: string, payload: { status: IncidentStatus; message?: string }) {
    return request<Incident>(`/admin/incidents/${id}/status`, { method: "PATCH", body: JSON.stringify(payload) })
  },
  addIncidentMessage(id: string, message: string) {
    return request<Incident>(`/admin/incidents/${id}/messages`, { method: "POST", body: JSON.stringify({ message }) })
  },
  purgeIncidentForDeveloper(id: string) {
    return request<{
      incidentId: string
      incidentDeleted: boolean
      messagesDeleted: number
      evidenceDeleted: number
      storageObjectsDeleted: number
    }>(`/admin/incidents/${id}/purge`, { method: "DELETE" })
  },
  deactivateEmployee(id: string) {
    return request<Employee>(`/employees/${id}`, { method: "DELETE" })
  },
  purgeEmployeeForDeveloper(id: string) {
    return request<{
      employeeId: string
      employeeDeleted: boolean
      linkedUsersAnonymized: number
      movementsDeleted: number
      payrollItemsDeleted: number
      payrollsRecalculated: number
      sensitiveDataStored: boolean
    }>(`/employees/${id}/purge`, { method: "DELETE" })
  },
  movements(params?: Record<string, string>) {
    const query = new URLSearchParams(params).toString()
    return request<Movement[]>(`/movements${query ? `?${query}` : ""}`)
  },
  createMovement(payload: Record<string, unknown>) {
    return request<Movement>("/movements", { method: "POST", body: JSON.stringify(payload) })
  },
  createAdministrativeMovement(payload: Record<string, unknown>) {
    return request<Movement>("/movements/administrative", { method: "POST", body: JSON.stringify(payload) })
  },
  payrollPreview(start: string, end: string) {
    const query = new URLSearchParams({ start, end }).toString()
    return request<PayrollPreview>(`/admin/payroll/preview?${query}`)
  },
  generatePayroll(payload: { period_start: string; period_end: string }) {
    return request<Payroll>("/admin/payroll/generate", { method: "POST", body: JSON.stringify(payload) })
  },
  payrolls() {
    return request<Payroll[]>("/admin/payroll")
  },
  payroll(id: string) {
    return request<Payroll>(`/admin/payroll/${id}`)
  },
  markPayrollPaid(id: string) {
    return request<Payroll>(`/admin/payroll/${id}/mark-paid`, { method: "POST" })
  },
  cancelPayroll(id: string, reason: string) {
    return request<Payroll>(`/admin/payroll/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) })
  },
  movementSettlementSummary(params: { employeeId: string; from?: string; to?: string }) {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, value]) => Boolean(value))) as Record<string, string>
    ).toString()
    return request<MovementSettlementSummary>(`/movements/settlement-summary?${query}`)
  },
  settleMovements(payload: { employeeId: string; from?: string; to?: string }) {
    return request<MovementSettlementSummary>("/movements/settlements", {
      method: "PATCH",
      body: JSON.stringify(payload)
    })
  },
  authorizeMovement(id: string) {
    return request<Movement>(`/movements/${id}/authorize`, { method: "PATCH" })
  },
  rejectMovement(id: string) {
    return request<Movement>(`/movements/${id}/reject`, { method: "PATCH" })
  },
  cancelMovement(id: string) {
    return request<Movement>(`/movements/${id}/cancel`, { method: "PATCH" })
  },
  deliverMovement(id: string) {
    return request<Movement>(`/movements/${id}/deliver`, { method: "PATCH" })
  },
  movementAudit(id: string) {
    return request<AuditLog[]>(`/movements/${id}/audit`)
  },
  configuration() {
    return request<AppConfig>("/configuration")
  },
  branches(includeInactive = false) {
    return request<Branch[]>(`/configuration/branches${includeInactive ? "?includeInactive=true" : ""}`)
  },
  createBranch(payload: Record<string, unknown>) {
    return request<Branch>("/configuration/branches", { method: "POST", body: JSON.stringify(payload) })
  },
  updateBranch(id: string, payload: Record<string, unknown>) {
    return request<Branch>(`/configuration/branches/${id}`, { method: "PATCH", body: JSON.stringify(payload) })
  },
  deleteBranch(id: string) {
    return request<Branch>(`/configuration/branches/${id}`, { method: "DELETE" })
  },
  updateConfiguration(payload: Partial<AppConfig>) {
    return request<AppConfig>("/configuration", { method: "PATCH", body: JSON.stringify(payload) })
  },
  updateRule(id: string, payload: Record<string, unknown>) {
    return request<unknown>(`/configuration/authorization-rules/${id}`, { method: "PATCH", body: JSON.stringify(payload) })
  },
  deleteRule(id: string) {
    return request<unknown>(`/configuration/authorization-rules/${id}`, { method: "DELETE" })
  },
  adminUsers() {
    return request<User[]>("/admin/users")
  },
  createAdminUser(payload: Record<string, unknown>) {
    return request<User>("/admin/users", { method: "POST", body: JSON.stringify(payload) })
  },
  updateAdminUser(id: string, payload: Record<string, unknown>) {
    return request<User>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) })
  },
  rules() {
    return request<
      Array<{ id: string; kind?: string; minAmount: string; maxAmount?: string; requiredRole: string }>
    >("/configuration/authorization-rules")
  },
  createRule(payload: Record<string, unknown>) {
    return request("/configuration/authorization-rules", { method: "POST", body: JSON.stringify(payload) })
  },
  timeClock: {
    device() {
      return timeClockRequest<{ id: string; name: string; branch: Branch }>("/time-clock/public/device")
    },
    verifyEmployeeCode(employeeCode: string) {
      return timeClockRequest<{ employee: Pick<Employee, "id" | "fullName" | "position"> }>("/time-clock/public/employee-code", {
        method: "POST",
        body: JSON.stringify({ employeeCode })
      })
    },
    registerEntry(payload: { employeeCode: string; type: TimeClockEventType; photo: Blob }) {
      const formData = new FormData()
      formData.append("employeeCode", payload.employeeCode)
      formData.append("type", payload.type)
      formData.append("photo", payload.photo, "checador.jpg")
      return timeClockFormRequest<{ ok: boolean; message: string; entry: TimeClockEntry }>("/time-clock/public/entries", formData)
    },
    requestDeviceAuthorization(requestToken: string) {
      return request<TimeClockDeviceRequest & { device?: { id: string; name: string; branch: Branch } }>("/time-clock/public/device-requests", {
        method: "POST",
        body: JSON.stringify({ requestToken })
      })
    }
  },
  adminTimeClock: {
    devices() {
      return request<TimeClockDevice[]>("/admin/time-clock/devices")
    },
    createDevice(payload: { name: string; branchId: string }) {
      return request<TimeClockDevice>("/admin/time-clock/devices", { method: "POST", body: JSON.stringify(payload) })
    },
    updateDevice(id: string, payload: Partial<{ name: string; branchId: string; active: boolean; rotateToken: boolean }>) {
      return request<TimeClockDevice>(`/admin/time-clock/devices/${id}`, { method: "PATCH", body: JSON.stringify(payload) })
    },
    deviceRequests() {
      return request<TimeClockDeviceRequest[]>("/admin/time-clock/device-requests")
    },
    approveDeviceRequest(id: string, payload: { name: string; branchId: string }) {
      return request<TimeClockDeviceRequest>(`/admin/time-clock/device-requests/${id}/approve`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      })
    },
    rejectDeviceRequest(id: string) {
      return request<TimeClockDeviceRequest>(`/admin/time-clock/device-requests/${id}/reject`, { method: "PATCH" })
    },
    attendance(params?: Partial<{ date: string; branchId: string; employeeId: string }>) {
      const query = new URLSearchParams(
        Object.fromEntries(Object.entries(params ?? {}).filter(([, value]) => Boolean(value))) as Record<string, string>
      ).toString()
      return request<AttendanceRow[]>(`/admin/time-clock/attendance${query ? `?${query}` : ""}`)
    },
    exportAttendance(params?: Partial<{ date: string; branchId: string; employeeId: string }>) {
      const query = new URLSearchParams(
        Object.fromEntries(Object.entries(params ?? {}).filter(([, value]) => Boolean(value))) as Record<string, string>
      ).toString()
      return blobRequest(`/admin/time-clock/export${query ? `?${query}` : ""}`)
    },
    employeeHistory(employeeId: string, params?: Partial<{ from: string; to: string }>) {
      const query = new URLSearchParams(
        Object.fromEntries(Object.entries(params ?? {}).filter(([, value]) => Boolean(value))) as Record<string, string>
      ).toString()
      return request<TimeClockEntry[]>(`/admin/time-clock/employees/${employeeId}/history${query ? `?${query}` : ""}`)
    },
    adjustments(params?: Partial<{ employeeId: string; branchId: string }>) {
      const query = new URLSearchParams(
        Object.fromEntries(Object.entries(params ?? {}).filter(([, value]) => Boolean(value))) as Record<string, string>
      ).toString()
      return request<AttendanceAdjustment[]>(`/admin/time-clock/adjustments${query ? `?${query}` : ""}`)
    },
    createAdjustment(payload: { employeeId: string; branchId?: string; type: TimeClockEventType; occurredAt?: string; reason: string; notes?: string }) {
      return request<{ entry: TimeClockEntry }>("/admin/time-clock/adjustments", { method: "POST", body: JSON.stringify(payload) })
    }
  },
  employeePortal: {
    login(phone: string, pin: string) {
      return employeeRequest<{ token: string; employee: Employee }>("/employee-portal/login", {
        method: "POST",
        body: JSON.stringify({ phone, pin })
      })
    },
    me() {
      return employeeRequest<Employee>("/employee-portal/me")
    },
    changeCode(currentCode: string, newCode: string) {
      return employeeRequest<Employee>("/employee-portal/code", {
        method: "PATCH",
        body: JSON.stringify({ currentCode, newCode })
      })
    },
    balance() {
      return employeeRequest<{
        pendingBalance: number
        totalDiscounted: number
        pendingRequests: number
        byKind: Array<{ kind: string; amount: number }>
      }>("/employee-portal/balance")
    },
    movements() {
      return employeeRequest<Movement[]>("/employee-portal/movements")
    },
    settlementTickets() {
      return employeeRequest<MovementSettlementTicket[]>("/employee-portal/settlement-tickets")
    },
    options() {
      return employeeRequest<{ beveragePrice: number; requestKinds: MovementKind[] }>("/employee-portal/options")
    },
    createRequest(payload: Record<string, unknown>) {
      return employeeRequest<Movement>("/employee-portal/requests", { method: "POST", body: JSON.stringify(payload) })
    }
  }
}
