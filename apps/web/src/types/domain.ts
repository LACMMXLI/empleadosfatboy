export type Role = "ADMINISTRADOR" | "GERENTE" | "ENCARGADO" | "CAJERO" | "EMPLEADO"
export type SalaryType = "WEEKLY" | "BIWEEKLY" | "DAILY"
export type PayrollStatus = "BORRADOR" | "GENERADA" | "PAGADA" | "CANCELADA"

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
  active?: boolean
  createdAt?: string
  updatedAt?: string
  branch?: Branch | null
  employee?: Employee | null
}

export type Branch = {
  id: string
  name: string
  code: string
  active: boolean
}

export type Employee = {
  id: string
  fullName: string
  position: string
  phone: string
  active: boolean
  salaryAmount: string | number
  salaryType: SalaryType
  hireDate?: string | null
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
  evidenceNote?: string
  requestIp?: string
  requestUserAgent?: string
  requestDevice?: string
  createdAt: string
  employee?: Employee
  registeredBy?: Pick<User, "id" | "fullName" | "role">
  authorizedBy?: Pick<User, "id" | "fullName" | "role">
  deliveredById?: string | null
  deliveredAt?: string | null
  deliveredBy?: Pick<User, "id" | "fullName" | "role"> | null
  quantity?: number | null
  unitPrice?: number | string | null
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

export type PayrollItem = {
  id?: string
  employeeId: string
  employeeName: string
  position: string
  salaryAmount?: number
  salaryType?: SalaryType
  baseSalary: number
  totalAdvances: number
  totalInternalConsumption: number
  totalAdminCharges: number
  totalPenalties: number
  totalPositiveAdjustments: number
  totalNegativeAdjustments: number
  totalDeductions: number
  netPay: number
  movements: Array<{ id: string; folio: string; kind: MovementKind; amount: number; reason: string; createdAt: string }>
}

export type PayrollPreview = {
  periodStart: string
  periodEnd: string
  periodKey: string
  status: "BORRADOR"
  totals: {
    totalGross: number
    totalDeductions: number
    totalAdjustments: number
    totalNet: number
  }
  items: PayrollItem[]
}

export type Payroll = {
  id: string
  periodStart: string
  periodEnd: string
  periodKey: string
  status: PayrollStatus
  totalGross: number
  totalDeductions: number
  totalAdjustments: number
  totalNet: number
  generatedAt: string
  paidAt?: string | null
  cancelledAt?: string | null
  cancelReason?: string | null
  generatedByAdmin?: Pick<User, "id" | "fullName" | "role">
  itemCount?: number
  items?: PayrollItem[]
}
