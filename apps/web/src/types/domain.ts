export type Role = "ADMINISTRADOR" | "GERENTE" | "ENCARGADO" | "CAJERO" | "EMPLEADO"
export type SalaryType = "WEEKLY" | "BIWEEKLY" | "DAILY"
export type PayrollStatus = "BORRADOR" | "GENERADA" | "PAGADA" | "CANCELADA"
export type TimeClockEventType = "ENTRY" | "EXIT"
export type TimeClockEntryStatus = "VALID" | "MANUAL" | "VOIDED"
export type WorkSessionStatus = "ACTIVE" | "CLOSED" | "ADJUSTED"
export type TimeClockDeviceRequestStatus = "PENDING" | "AUTHORIZED" | "REJECTED" | "EXPIRED"

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

export type FileAssetModule = "INCIDENCIAS" | "EMPLEADOS" | "CHECKLISTS" | "TIMECLOCK"

export type FileAsset = {
  id: string
  bucket: string
  key: string
  originalName: string
  mimeType: string
  size: number
  module: FileAssetModule
  entityId?: string | null
  branchId?: string | null
  url: string
  apiUrl: string
  createdAt: string
}

export type IncidentStatus = "REPORTADA" | "VISTA" | "EN_PROCESO" | "RESUELTA" | "CERRADA"

export type IncidentMessage = {
  id: string
  message: string
  createdAt: string
  author?: Pick<User, "id" | "fullName" | "role"> | null
}

export type Incident = {
  id: string
  folio: string
  title: string
  description: string
  status: IncidentStatus
  employeeId?: string | null
  branchId: string
  viewedAt?: string | null
  resolvedAt?: string | null
  closedAt?: string | null
  employee?: Employee | null
  branch?: Branch
  reportedByUser?: Pick<User, "id" | "fullName" | "role"> | null
  messages: IncidentMessage[]
  evidence: FileAsset[]
  createdAt: string
  updatedAt: string
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

export type TimeClockDevice = {
  id: string
  name: string
  branchId: string
  tokenLast4: string
  active: boolean
  branch: Branch
  createdAt: string
  updatedAt?: string
  setupToken?: string
}

export type TimeClockDeviceRequest = {
  id: string
  code: string
  requestTokenLast4?: string
  status: TimeClockDeviceRequestStatus
  branchId?: string | null
  deviceName?: string | null
  authorizedDeviceId?: string | null
  authorizedById?: string | null
  requestIp?: string | null
  requestUserAgent?: string | null
  expiresAt?: string
  branch?: Branch | null
  authorizedDevice?: TimeClockDevice | null
  createdAt?: string
  updatedAt?: string
}

export type TimeClockEntry = {
  id: string
  employeeId: string
  branchId: string
  deviceId?: string | null
  type: TimeClockEventType
  occurredAt: string
  localDate: string
  localTime: string
  timeZone: string
  evidenceFileId?: string | null
  status: TimeClockEntryStatus
  notes?: string | null
  requestIp?: string | null
  requestUserAgent?: string | null
  employee?: Employee
  branch?: Branch
  device?: Pick<TimeClockDevice, "id" | "name" | "tokenLast4" | "active"> | null
  evidenceFile?: FileAsset | null
  createdByUser?: Pick<User, "id" | "fullName" | "role"> | null
  createdAt: string
}

export type WorkSession = {
  id: string
  employeeId: string
  branchId: string
  deviceId?: string | null
  startedAt: string
  endedAt?: string | null
  localDate: string
  status: WorkSessionStatus
  totalMinutes?: number | null
  startEntry?: TimeClockEntry
  endEntry?: TimeClockEntry | null
}

export type AttendanceRow = {
  employee: Employee
  branch: Branch
  date: string
  status: "IN_SHIFT" | "EXITED" | "NO_SHOW"
  activeSession?: WorkSession | null
  lastEntry?: TimeClockEntry | null
  entries: TimeClockEntry[]
  sessions: WorkSession[]
}

export type AttendanceAdjustment = {
  id: string
  employeeId: string
  branchId: string
  entryId?: string | null
  workSessionId?: string | null
  action: string
  reason: string
  oldValue?: unknown
  newValue?: unknown
  ipAddress?: string | null
  employee?: Employee
  branch?: Branch
  adjustedBy?: Pick<User, "id" | "fullName" | "role">
  entry?: TimeClockEntry | null
  workSession?: WorkSession | null
  createdAt: string
}
