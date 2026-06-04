import type { AppConfig, AuditLog, DashboardSummary, Employee, Movement, MovementKind, Role, User } from "@/types/domain"

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
  employees(q?: string) {
    const params = q ? `?q=${encodeURIComponent(q)}` : ""
    return request<Employee[]>(`/employees${params}`)
  },
  createEmployee(payload: Record<string, unknown>) {
    return request<Employee>("/employees", { method: "POST", body: JSON.stringify(payload) })
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
    options() {
      return employeeRequest<{ beveragePrice: number; requestKinds: MovementKind[] }>("/employee-portal/options")
    },
    createRequest(payload: Record<string, unknown>) {
      return employeeRequest<Movement>("/employee-portal/requests", { method: "POST", body: JSON.stringify(payload) })
    }
  }
}
