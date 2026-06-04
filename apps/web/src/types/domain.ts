export type Role = "ADMINISTRADOR" | "GERENTE" | "ENCARGADO" | "CAJERO" | "EMPLEADO"

export type MovementKind =
  | "SALARY_ADVANCE"
  | "LOAN"
  | "INTERNAL_CONSUMPTION"
  | "DRINK"
  | "FOOD"
  | "CASH_OUT"
  | "ADMIN_ADJUSTMENT"
  | "ADMIN_CHARGE"
  | "SHORTAGE_DISCOUNT"
  | "DAMAGE_DISCOUNT"
  | "BALANCE_CORRECTION"
  | "ADMIN_SALARY_ADVANCE"
  | "ADMIN_LOAN"

export type MovementOrigin = "EMPLOYEE_REQUEST" | "ADMINISTRATIVE_ACTION"

export type MovementStatus =
  | "PENDING"
  | "AUTHORIZED"
  | "REJECTED"
  | "CANCELED"
  | "DISCOUNTED"
  | "PARTIALLY_DISCOUNTED"

export type User = {
  id: string
  fullName: string
  email: string
  role: Role
  branch?: Branch | null
  employee?: Employee | null
}

export type Branch = {
  id: string
  name: string
  code: string
}

export type Employee = {
  id: string
  fullName: string
  position: string
  phone: string
  active: boolean
  branch: Branch
}

export type Movement = {
  id: string
  folio: string
  employeeId: string
  kind: MovementKind
  origin: MovementOrigin
  amount: string | number
  reason: string
  status: MovementStatus
  productName?: string
  requestIp?: string
  requestUserAgent?: string
  requestDevice?: string
  createdAt: string
  employee?: Employee
  registeredBy?: Pick<User, "id" | "fullName" | "role">
  authorizedBy?: Pick<User, "id" | "fullName" | "role">
}

export type AuditLog = {
  id: string
  action: string
  entity: string
  entityId?: string
  affectedEmployeeId?: string
  oldValue?: unknown
  newValue?: unknown
  ipAddress?: string
  createdAt: string
  user?: Pick<User, "id" | "fullName" | "role">
}

export type DashboardSummary = {
  cards: {
    advancesToday: number
    consumptionsToday: number
    cashOutToday: number
    pendingToDiscount: number
    pendingMovements: number
    authorizedMovements: number
  }
  weeklyAdvances: Array<{ date: string; amount: number; employee: string }>
}

export type AppConfig = {
  businessName: string
  beveragePrice: string | number
  receiptLegalText: string
}

export type MovementSettlementSummary = {
  employeeId: string
  from?: string
  to?: string
  ticketNumber?: string
  settledAt?: string
  count: number
  total: number
  byKind?: Array<{ kind: MovementKind; count: number; amount: number }>
  movements?: Array<{ folio: string; kind: MovementKind; amount: number; reason?: string; createdAt?: string }>
}

export type MovementSettlementTicket = {
  id: string
  ticketNumber: string
  employeeId: string
  from?: string
  to?: string
  settledAt: string
  count: number
  total: number
  byKind: Array<{ kind: MovementKind; count: number; amount: number }>
  movements: Array<{ folio: string; kind: MovementKind; amount: number; reason?: string; createdAt?: string }>
  folios: string[]
}
