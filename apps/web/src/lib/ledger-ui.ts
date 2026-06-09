import type { CSSProperties } from "react"
import { z } from "zod"
import type { MovementKind, MovementStatus, SalaryType } from "@/types/domain"

export const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" })

export const insetPanelStyle: CSSProperties = {
  border: "1px solid rgb(var(--surface-line) / 0.42)",
  background: "rgb(var(--surface-control) / 0.88)"
}

export const insetPanelStrongStyle: CSSProperties = {
  border: "1px solid rgb(var(--surface-line) / 0.5)",
  background: "rgb(var(--surface-control-strong) / 0.92)"
}

export const movementLabels: Record<MovementKind, string> = {
  SALARY_ADVANCE: "Adelanto",
  LOAN: "Prestamo",
  INTERNAL_CONSUMPTION: "Consumo interno",
  DRINK: "Bebida",
  FOOD: "Comida",
  CASH_OUT: "Salida efectivo",
  ADMIN_ADJUSTMENT: "Descuento administrativo",
  ADMIN_CHARGE: "Ajuste manual",
  SHORTAGE_DISCOUNT: "Cargo por faltante",
  DAMAGE_DISCOUNT: "Penalización",
  BALANCE_CORRECTION: "Corrección autorizada",
  ADMIN_SALARY_ADVANCE: "Adelanto admin",
  ADMIN_LOAN: "Préstamo admin"
}

export const statusLabels: Record<MovementStatus, string> = {
  PENDING: "Pendiente",
  AUTHORIZED: "Autorizado",
  REJECTED: "Rechazado",
  CANCELED: "Cancelado",
  DISCOUNTED: "Descontado",
  PARTIALLY_DISCOUNTED: "Parcial"
}

export const salaryTypeLabels: Record<SalaryType, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal",
  DAILY: "Diario"
}

export const payrollStatusLabels: Record<string, string> = {
  BORRADOR: "Borrador",
  GENERADA: "Generada",
  PAGADA: "Pagada",
  CANCELADA: "Cancelada"
}

export type View = "dashboard" | "empleados" | "pendientes" | "adminMovements" | "historial" | "incidencias" | "nomina" | "configuracion" | "entregas"
export type PortalRoute = "home" | "admin" | "employee"

export const viewTitles: Record<View, string> = {
  dashboard: "Dashboard",
  empleados: "Empleados",
  pendientes: "Aprobaciones",
  adminMovements: "Movimientos",
  historial: "Historial",
  incidencias: "Incidencias",
  nomina: "Nómina",
  configuracion: "Configuración",
  entregas: "Entregas"
}

export function getStatusBadgeClass(status: MovementStatus): string {
  switch (status) {
    case "PENDING": return "badge-status badge-pending"
    case "AUTHORIZED": return "badge-status badge-authorized"
    case "REJECTED": return "badge-status badge-rejected"
    case "CANCELED": return "badge-status badge-canceled"
    case "DISCOUNTED": return "badge-status badge-discounted"
    case "PARTIALLY_DISCOUNTED": return "badge-status badge-partial"
    default: return "badge-status badge-canceled"
  }
}

export function getPayrollBadgeClass(status: string): string {
  switch (status) {
    case "BORRADOR": return "badge-payroll-draft"
    case "GENERADA": return "badge-payroll-generated"
    case "PAGADA": return "badge-payroll-paid"
    case "CANCELADA": return "badge-payroll-canceled"
    default: return "badge-payroll-draft"
  }
}

export function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()
}

export const adminMovementSchema = z.object({
  employeeId: z.string().min(1, "Selecciona empleado"),
  kind: z.enum([
    "ADMIN_ADJUSTMENT",
    "ADMIN_CHARGE",
    "INTERNAL_CONSUMPTION",
    "SHORTAGE_DISCOUNT",
    "DAMAGE_DISCOUNT",
    "BALANCE_CORRECTION"
  ]),
  amount: z.coerce.number().positive("Cantidad invalida"),
  reason: z.string().min(3, "Motivo requerido"),
  evidenceNote: z.string().optional()
})
export type AdminMovementFormInput = z.input<typeof adminMovementSchema>
export type AdminMovementFormOutput = z.output<typeof adminMovementSchema>

export const employeeRequestSchema = z.object({
  kind: z.enum(["SALARY_ADVANCE", "DRINK", "INTERNAL_CONSUMPTION"]),
  amount: z.preprocess((value) => {
    if (value === "" || value === null || typeof value === "undefined") return 0
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }, z.number().positive("El monto debe ser mayor a $0")),
  reason: z.string().optional(),
  productName: z.string().optional(),
  quantity: z.coerce.number().optional(),
  unitPrice: z.coerce.number().optional()
}).superRefine((data, ctx) => {
  if (data.kind !== "DRINK" && (!data.reason || data.reason.trim().length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Agrega un motivo para continuar",
      path: ["reason"]
    })
  }
})
export type EmployeeRequestFormInput = z.input<typeof employeeRequestSchema>
export type EmployeeRequestFormOutput = z.output<typeof employeeRequestSchema>

export const employeeSchema = z.object({
  fullName: z.string().min(3),
  pin: z.string().length(6),
  position: z.string().min(2),
  phone: z.string().min(10, "Teléfono a 10 dígitos requerido"),
  salaryAmount: z.coerce.number().min(0),
  salaryType: z.enum(["WEEKLY", "BIWEEKLY", "DAILY"]),
  hireDate: z.string().optional(),
  branchId: z.string().min(1, "Selecciona una sucursal")
})
export type EmployeeFormInput = z.input<typeof employeeSchema>
export type EmployeeFormOutput = z.output<typeof employeeSchema>

export const employeeEditSchema = z.object({
  fullName: z.string().min(3),
  pin: z.string().optional().refine((value) => !value || value.length === 6, "PIN a 6 dígitos"),
  position: z.string().min(2),
  phone: z.string().min(10, "Teléfono a 10 dígitos requerido"),
  salaryAmount: z.coerce.number().min(0),
  salaryType: z.enum(["WEEKLY", "BIWEEKLY", "DAILY"]),
  hireDate: z.string().optional(),
  branchId: z.string().min(1, "Selecciona una sucursal")
})
export type EmployeeEditFormInput = z.input<typeof employeeEditSchema>
export type EmployeeEditFormOutput = z.output<typeof employeeEditSchema>

export const ruleSchema = z.object({
  kind: z.string().optional(),
  minAmount: z.coerce.number().min(0),
  maxAmount: z.coerce.number().optional(),
  requiredRole: z.enum(["ADMINISTRADOR", "GERENTE", "ENCARGADO", "CAJERO", "EMPLEADO"])
})
export type RuleFormInput = z.input<typeof ruleSchema>
export type RuleFormOutput = z.output<typeof ruleSchema>

export const configSchema = z.object({
  beveragePrice: z.coerce.number().positive("Precio invalido")
})
export type ConfigFormInput = z.input<typeof configSchema>
export type ConfigFormOutput = z.output<typeof configSchema>

export const adminUserSchema = z.object({
  fullName: z.string().min(3, "Nombre requerido"),
  email: z.string().email("Correo invalido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  role: z.enum(["ADMINISTRADOR", "GERENTE", "ENCARGADO", "CAJERO"]),
  branchId: z.string().optional()
})
export type AdminUserFormInput = z.input<typeof adminUserSchema>
export type AdminUserFormOutput = z.output<typeof adminUserSchema>

export const adminUserEditSchema = z.object({
  fullName: z.string().min(3, "Nombre requerido"),
  email: z.string().email("Correo invalido"),
  password: z.string().optional().refine((value) => !value || value.length >= 8, "Mínimo 8 caracteres"),
  role: z.enum(["ADMINISTRADOR", "GERENTE", "ENCARGADO", "CAJERO"]),
  branchId: z.string().optional()
})
export type AdminUserEditFormInput = z.input<typeof adminUserEditSchema>
export type AdminUserEditFormOutput = z.output<typeof adminUserEditSchema>

export const employeeRequestKinds: MovementKind[] = ["SALARY_ADVANCE", "DRINK", "INTERNAL_CONSUMPTION"]
export const quickRequestReasons = ["Emergencia", "Transporte", "Familiar", "Médico", "Otro"]
export const administrativeMovementKinds: MovementKind[] = [
  "ADMIN_ADJUSTMENT",
  "SHORTAGE_DISCOUNT",
  "INTERNAL_CONSUMPTION",
  "ADMIN_CHARGE",
  "DAMAGE_DISCOUNT",
  "BALANCE_CORRECTION"
]

export const branchSchema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  code: z.string().min(2, "Código de sucursal requerido").toUpperCase()
})
export type BranchFormInput = z.input<typeof branchSchema>
export type BranchFormOutput = z.output<typeof branchSchema>
