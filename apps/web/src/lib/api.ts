import type { AppConfig, AuditLog, DashboardSummary, Employee, Movement, MovementKind, MovementSettlementSummary, MovementSettlementTicket, Payroll, PayrollPreview, Role, User } from "@/types/domain"

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
  deactivateEmployee(id: string) {
    return request<Employee>(`/employees/${id}`, { method: "DELETE" })
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
  movementAudit(id: string) {
    return request<AuditLog[]>(`/movements/${id}/audit`)
  },
  configuration() {
    return request<AppConfig>("/configuration")
  },
  updateConfiguration(payload: Partial<AppConfig>) {
    return request<AppConfig>("/configuration", { method: "PATCH", body: JSON.stringify(payload) })
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
