import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common"
import { AuditAction, MovementKind, MovementStatus, PayrollStatus, Prisma, SalaryType } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { AuditService } from "../audit/audit.service"

type PayrollPeriodInput = {
  periodStart: string
  periodEnd: string
  rejectDuplicate?: boolean
}

type PayrollEmployeeCalculation = {
  employeeId: string
  employeeName: string
  position: string
  salaryAmount: number
  salaryType: SalaryType
  baseSalary: number
  totalAdvances: number
  totalInternalConsumption: number
  totalAdminCharges: number
  totalPenalties: number
  totalPositiveAdjustments: number
  totalNegativeAdjustments: number
  totalDeductions: number
  netPay: number
  movements: Array<{ id: string; folio: string; kind: MovementKind; amount: number; reason: string; createdAt: Date }>
}

const payrollMovementKinds: MovementKind[] = [
  MovementKind.SALARY_ADVANCE,
  MovementKind.LOAN,
  MovementKind.ADMIN_SALARY_ADVANCE,
  MovementKind.ADMIN_LOAN,
  MovementKind.INTERNAL_CONSUMPTION,
  MovementKind.DRINK,
  MovementKind.FOOD,
  MovementKind.ADMIN_CHARGE,
  MovementKind.SHORTAGE_DISCOUNT,
  MovementKind.DAMAGE_DISCOUNT,
  MovementKind.ADMIN_ADJUSTMENT,
  MovementKind.BALANCE_CORRECTION
]
const advanceKinds: MovementKind[] = [
  MovementKind.SALARY_ADVANCE,
  MovementKind.LOAN,
  MovementKind.ADMIN_SALARY_ADVANCE,
  MovementKind.ADMIN_LOAN
]
const consumptionKinds: MovementKind[] = [
  MovementKind.INTERNAL_CONSUMPTION,
  MovementKind.DRINK,
  MovementKind.FOOD
]
const adminChargeKinds: MovementKind[] = [
  MovementKind.ADMIN_CHARGE,
  MovementKind.SHORTAGE_DISCOUNT
]

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async preview(input: PayrollPeriodInput) {
    const period = await this.resolvePeriod(input)
    const calculations = await this.calculate(period.start, period.end)
    return this.buildPreview(period, calculations)
  }

  async generate(input: PayrollPeriodInput, adminId: string, ipAddress?: string) {
    const period = await this.resolvePeriod({ ...input, rejectDuplicate: true })
    const calculations = await this.calculate(period.start, period.end)
    const preview = this.buildPreview(period, calculations)

    const payroll = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payroll.create({
        data: {
          periodStart: period.start,
          periodEnd: period.end,
          periodKey: period.key,
          status: PayrollStatus.GENERADA,
          totalGross: preview.totals.totalGross,
          totalDeductions: preview.totals.totalDeductions,
          totalAdjustments: preview.totals.totalAdjustments,
          totalNet: preview.totals.totalNet,
          generatedByAdminId: adminId,
          items: {
            create: calculations.map((item) => ({
              employeeId: item.employeeId,
              baseSalary: item.baseSalary,
              totalAdvances: item.totalAdvances,
              totalInternalConsumption: item.totalInternalConsumption,
              totalAdminCharges: item.totalAdminCharges,
              totalPenalties: item.totalPenalties,
              totalPositiveAdjustments: item.totalPositiveAdjustments,
              totalNegativeAdjustments: item.totalNegativeAdjustments,
              totalDeductions: item.totalDeductions,
              netPay: item.netPay,
              movements: {
                create: item.movements.map((movement) => ({ movementId: movement.id }))
              }
            }))
          }
        },
        include: this.payrollInclude()
      })

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: AuditAction.CREATE,
          entity: "Payroll",
          entityId: created.id,
          newValue: this.toJson({
            periodKey: created.periodKey,
            totals: preview.totals,
            includedMovementIds: calculations.flatMap((item) => item.movements.map((movement) => movement.id))
          }),
          ipAddress
        }
      })

      return created
    }).catch((error) => {
      if (this.isUniqueError(error)) {
        throw new ConflictException("Ya existe una nómina o movimiento relacionado para este periodo")
      }
      throw error
    })

    return this.serializePayroll(payroll)
  }

  async list() {
    const payrolls = await this.prisma.payroll.findMany({
      include: { generatedByAdmin: { select: { id: true, fullName: true, role: true } }, items: true },
      orderBy: { createdAt: "desc" },
      take: 50
    })
    return payrolls.map((payroll) => ({
      id: payroll.id,
      periodStart: payroll.periodStart,
      periodEnd: payroll.periodEnd,
      periodKey: payroll.periodKey,
      status: payroll.status,
      totalGross: Number(payroll.totalGross),
      totalDeductions: Number(payroll.totalDeductions),
      totalAdjustments: Number(payroll.totalAdjustments),
      totalNet: Number(payroll.totalNet),
      generatedAt: payroll.generatedAt,
      paidAt: payroll.paidAt,
      cancelledAt: payroll.cancelledAt,
      cancelReason: payroll.cancelReason,
      generatedByAdmin: payroll.generatedByAdmin,
      itemCount: payroll.items.length
    }))
  }

  async get(id: string) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id },
      include: this.payrollInclude()
    })
    if (!payroll) throw new NotFoundException("Nómina no encontrada")
    return this.serializePayroll(payroll)
  }

  async markPaid(id: string, adminId: string, ipAddress?: string) {
    const payroll = await this.prisma.payroll.findUnique({ where: { id } })
    if (!payroll) throw new NotFoundException("Nómina no encontrada")
    if (payroll.status === PayrollStatus.CANCELADA) throw new BadRequestException("No se puede pagar una nómina cancelada")
    if (payroll.status === PayrollStatus.PAGADA) return this.get(id)

    const updated = await this.prisma.payroll.update({
      where: { id },
      data: { status: PayrollStatus.PAGADA, paidAt: new Date() },
      include: this.payrollInclude()
    })
    await this.audit.log({
      userId: adminId,
      action: AuditAction.STATUS_CHANGE,
      entity: "Payroll",
      entityId: id,
      oldValue: this.toJson(payroll),
      newValue: this.toJson({ status: updated.status, paidAt: updated.paidAt }),
      ipAddress
    })
    return this.serializePayroll(updated)
  }

  async cancel(id: string, reason: string, adminId: string, ipAddress?: string) {
    if (!reason?.trim()) throw new BadRequestException("El motivo de cancelación es obligatorio")
    const payroll = await this.prisma.payroll.findUnique({ where: { id } })
    if (!payroll) throw new NotFoundException("Nómina no encontrada")
    if (payroll.status === PayrollStatus.PAGADA) throw new BadRequestException("No se puede cancelar una nómina pagada")
    if (payroll.status === PayrollStatus.CANCELADA) return this.get(id)

    const updated = await this.prisma.payroll.update({
      where: { id },
      data: {
        status: PayrollStatus.CANCELADA,
        cancelledAt: new Date(),
        cancelReason: reason.trim()
      },
      include: this.payrollInclude()
    })
    await this.audit.log({
      userId: adminId,
      action: AuditAction.CANCEL,
      entity: "Payroll",
      entityId: id,
      oldValue: this.toJson(payroll),
      newValue: this.toJson({ status: updated.status, cancelledAt: updated.cancelledAt, cancelReason: updated.cancelReason }),
      ipAddress
    })
    return this.serializePayroll(updated)
  }

  private async resolvePeriod(input: PayrollPeriodInput) {
    const start = this.parseDate(input.periodStart, "fecha_inicio")
    const end = this.parseDate(input.periodEnd, "fecha_fin")
    if (start.getTime() > end.getTime()) {
      throw new BadRequestException("fecha_inicio debe ser menor o igual a fecha_fin")
    }
    const key = `${this.dateKey(start)}_${this.dateKey(end)}`
    if (input.rejectDuplicate) {
      const existing = await this.prisma.payroll.findUnique({ where: { periodKey: key }, select: { id: true } })
      if (existing) throw new ConflictException("Ya existe una nómina para este periodo")
    }
    return { start, end, key }
  }

  private async calculate(periodStart: Date, periodEnd: Date): Promise<PayrollEmployeeCalculation[]> {
    const employees = await this.prisma.employee.findMany({
      where: { active: true },
      include: {
        movements: {
          where: {
            status: MovementStatus.AUTHORIZED,
            kind: { in: payrollMovementKinds },
            createdAt: { gte: periodStart, lt: this.nextDay(periodEnd) },
            payrollLinks: { none: {} }
          },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { fullName: "asc" }
    })
    if (!employees.length) throw new BadRequestException("No hay empleados activos para generar nómina")

    return employees.map((employee) => {
      const baseSalary = this.resolveBaseSalary(Number(employee.salaryAmount), employee.salaryType, periodStart, periodEnd)
      const totals = {
        totalAdvances: 0,
        totalInternalConsumption: 0,
        totalAdminCharges: 0,
        totalPenalties: 0,
        totalPositiveAdjustments: 0,
        totalNegativeAdjustments: 0
      }
      for (const movement of employee.movements) {
        const amount = Number(movement.amount)
        if (!Number.isFinite(amount) || amount < 0) throw new BadRequestException("Movimiento con monto inválido")
        if (advanceKinds.includes(movement.kind)) {
          totals.totalAdvances += amount
        } else if (consumptionKinds.includes(movement.kind)) {
          totals.totalInternalConsumption += amount
        } else if (adminChargeKinds.includes(movement.kind)) {
          totals.totalAdminCharges += amount
        } else if (movement.kind === MovementKind.DAMAGE_DISCOUNT) {
          totals.totalPenalties += amount
        } else if (movement.kind === MovementKind.BALANCE_CORRECTION) {
          totals.totalPositiveAdjustments += amount
        } else if (movement.kind === MovementKind.ADMIN_ADJUSTMENT) {
          totals.totalNegativeAdjustments += amount
        }
      }
      const totalDeductions = this.round(
        totals.totalAdvances + totals.totalInternalConsumption + totals.totalAdminCharges + totals.totalPenalties + totals.totalNegativeAdjustments
      )
      const netPay = this.round(baseSalary + totals.totalPositiveAdjustments - totalDeductions)
      return {
        employeeId: employee.id,
        employeeName: employee.fullName,
        position: employee.position,
        salaryAmount: Number(employee.salaryAmount),
        salaryType: employee.salaryType,
        baseSalary,
        ...this.roundTotals(totals),
        totalDeductions,
        netPay,
        movements: employee.movements.map((movement) => ({
          id: movement.id,
          folio: movement.folio,
          kind: movement.kind,
          amount: Number(movement.amount),
          reason: movement.reason,
          createdAt: movement.createdAt
        }))
      }
    })
  }

  private buildPreview(period: { start: Date; end: Date; key: string }, items: PayrollEmployeeCalculation[]) {
    const totals = items.reduce(
      (acc, item) => {
        acc.totalGross += item.baseSalary
        acc.totalDeductions += item.totalDeductions
        acc.totalAdjustments += item.totalPositiveAdjustments - item.totalNegativeAdjustments
        acc.totalNet += item.netPay
        return acc
      },
      { totalGross: 0, totalDeductions: 0, totalAdjustments: 0, totalNet: 0 }
    )
    return {
      periodStart: period.start,
      periodEnd: period.end,
      periodKey: period.key,
      status: "BORRADOR" as const,
      totals: this.roundTotals(totals),
      items
    }
  }

  private serializePayroll(payroll: Prisma.PayrollGetPayload<{ include: ReturnType<PayrollService["payrollInclude"]> }>) {
    return {
      id: payroll.id,
      periodStart: payroll.periodStart,
      periodEnd: payroll.periodEnd,
      periodKey: payroll.periodKey,
      status: payroll.status,
      totalGross: Number(payroll.totalGross),
      totalDeductions: Number(payroll.totalDeductions),
      totalAdjustments: Number(payroll.totalAdjustments),
      totalNet: Number(payroll.totalNet),
      generatedAt: payroll.generatedAt,
      paidAt: payroll.paidAt,
      cancelledAt: payroll.cancelledAt,
      cancelReason: payroll.cancelReason,
      generatedByAdmin: payroll.generatedByAdmin,
      items: payroll.items.map((item) => ({
        id: item.id,
        employeeId: item.employeeId,
        employeeName: item.employee.fullName,
        position: item.employee.position,
        baseSalary: Number(item.baseSalary),
        totalAdvances: Number(item.totalAdvances),
        totalInternalConsumption: Number(item.totalInternalConsumption),
        totalAdminCharges: Number(item.totalAdminCharges),
        totalPenalties: Number(item.totalPenalties),
        totalPositiveAdjustments: Number(item.totalPositiveAdjustments),
        totalNegativeAdjustments: Number(item.totalNegativeAdjustments),
        totalDeductions: Number(item.totalDeductions),
        netPay: Number(item.netPay),
        movements: item.movements.map((link) => ({
          id: link.movement.id,
          folio: link.movement.folio,
          kind: link.movement.kind,
          amount: Number(link.movement.amount),
          reason: link.movement.reason,
          createdAt: link.movement.createdAt
        }))
      }))
    }
  }

  private payrollInclude() {
    return {
      generatedByAdmin: { select: { id: true, fullName: true, role: true } },
      items: {
        include: {
          employee: true,
          movements: {
            include: { movement: true }
          }
        },
        orderBy: { createdAt: "asc" }
      }
    } satisfies Prisma.PayrollInclude
  }

  private resolveBaseSalary(amount: number, salaryType: SalaryType, start: Date, end: Date) {
    if (!Number.isFinite(amount) || amount < 0) throw new BadRequestException("Empleado con sueldo inválido")
    if (salaryType === SalaryType.DAILY) return this.round(amount * this.inclusiveDays(start, end))
    return this.round(amount)
  }

  private inclusiveDays(start: Date, end: Date) {
    const msPerDay = 24 * 60 * 60 * 1000
    return Math.floor((this.startOfDay(end).getTime() - this.startOfDay(start).getTime()) / msPerDay) + 1
  }

  private parseDate(value: string, label: string) {
    if (!value) throw new BadRequestException(`${label} es requerida`)
    const date = new Date(`${value}T00:00:00`)
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} inválida`)
    return this.startOfDay(date)
  }

  private startOfDay(date: Date) {
    const copy = new Date(date)
    copy.setHours(0, 0, 0, 0)
    return copy
  }

  private nextDay(date: Date) {
    const copy = this.startOfDay(date)
    copy.setDate(copy.getDate() + 1)
    return copy
  }

  private dateKey(date: Date) {
    return date.toISOString().slice(0, 10)
  }

  private round(value: number) {
    return Number(value.toFixed(2))
  }

  private roundTotals<T extends Record<string, number>>(totals: T): T {
    return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, this.round(value)])) as T
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
  }

  private isUniqueError(error: unknown) {
    return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002")
  }
}
