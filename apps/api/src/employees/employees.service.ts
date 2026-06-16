import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { AuditAction, MovementStatus, Prisma, Role, SalaryType } from "@prisma/client"
import bcrypt from "bcryptjs"
import { PrismaService } from "../prisma/prisma.service"
import { AuditService } from "../audit/audit.service"
import type { AuthUser } from "../auth/auth.types"

type EmployeeWrite = {
  fullName?: string
  pin?: string
  position?: string
  branchId?: string
  phone?: string
  active?: boolean
  salaryAmount?: number
  salaryType?: SalaryType
  hireDate?: string
}

const balanceStatuses: MovementStatus[] = [
  MovementStatus.AUTHORIZED,
  MovementStatus.PARTIALLY_DISCOUNTED
]

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService
  ) {}

  list(filters: { q?: string; branchId?: string; includeInactive?: boolean }, user: AuthUser) {
    const clientWhere = this.definedEmployeeWhere({
      active: filters.includeInactive ? undefined : true,
      branchId: filters.branchId,
      OR: filters.q
        ? [
            { fullName: { contains: filters.q, mode: "insensitive" } },
            { position: { contains: filters.q, mode: "insensitive" } },
            { phone: { contains: filters.q, mode: "insensitive" } }
          ]
        : undefined
    })

    return this.prisma.employee.findMany({
      where: this.andEmployeeWhere(this.scopeForUser(user), clientWhere),
      include: { branch: true },
      orderBy: { fullName: "asc" },
      take: 50
    })
  }

  async get(id: string, user: AuthUser) {
    const employee = await this.prisma.employee.findFirst({
      where: this.andEmployeeWhere(this.scopeForUser(user), { id }),
      include: {
        branch: true,
        movements: {
          include: { registeredBy: true, authorizedBy: true },
          orderBy: { createdAt: "desc" },
          take: 100
        }
      }
    })
    if (!employee) throw new NotFoundException("Empleado no encontrado")
    return employee
  }

  async create(
    dto: Required<Pick<EmployeeWrite, "fullName" | "pin" | "position" | "branchId" | "phone">> & EmployeeWrite,
    user: AuthUser,
    ipAddress?: string
  ) {
    const branchId = await this.ensureBranchWritable(dto.branchId, user)
    const employee = await this.prisma.employee.create({
      data: {
        fullName: dto.fullName,
        pinHash: await bcrypt.hash(dto.pin, 12),
        position: dto.position,
        branchId,
        phone: dto.phone,
        salaryAmount: dto.salaryAmount ?? 0,
        salaryType: dto.salaryType ?? SalaryType.WEEKLY,
        hireDate: dto.hireDate ? this.parseDate(dto.hireDate) : undefined
      }
    })
    await this.audit.log({
      userId: user.sub,
      action: AuditAction.CREATE,
      entity: "Employee",
      entityId: employee.id,
      newValue: this.cleanEmployee(employee),
      ipAddress
    })
    return employee
  }

  async update(id: string, dto: EmployeeWrite, user: AuthUser, ipAddress?: string) {
    const before = await this.prisma.employee.findFirst({
      where: this.andEmployeeWhere(this.scopeForUser(user), { id })
    })
    if (!before) throw new NotFoundException("Empleado no encontrado")
    const branchId = dto.branchId ? await this.ensureBranchWritable(dto.branchId, user) : undefined

    const data: Prisma.EmployeeUpdateInput = {
      fullName: dto.fullName,
      position: dto.position,
      phone: dto.phone,
      active: dto.active,
      salaryAmount: typeof dto.salaryAmount === "number" ? dto.salaryAmount : undefined,
      salaryType: dto.salaryType,
      hireDate: dto.hireDate ? this.parseDate(dto.hireDate) : undefined,
      branch: branchId ? { connect: { id: branchId } } : undefined
    }
    if (dto.pin) data.pinHash = await bcrypt.hash(dto.pin, 12)

    const employee = await this.prisma.employee.update({ where: { id }, data })
    await this.audit.log({
      userId: user.sub,
      action: AuditAction.UPDATE,
      entity: "Employee",
      entityId: id,
      oldValue: this.cleanEmployee(before),
      newValue: this.cleanEmployee(employee),
      ipAddress
    })
    return employee
  }

  async deactivate(id: string, userId: string, ipAddress?: string) {
    const before = await this.prisma.employee.findUnique({ where: { id } })
    if (!before) throw new NotFoundException("Empleado no encontrado")
    const employee = await this.prisma.employee.update({ where: { id }, data: { active: false } })
    await this.audit.log({
      userId,
      action: AuditAction.UPDATE,
      entity: "Employee",
      entityId: id,
      oldValue: this.cleanEmployee(before),
      newValue: this.cleanEmployee(employee),
      ipAddress
    })
    return employee
  }

  async purgeForDeveloper(id: string, userId: string, ipAddress?: string) {
    if (!this.isDeveloperMaintenanceEnabled()) {
      throw new ForbiddenException("Mantenimiento de desarrollador deshabilitado")
    }

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({ where: { id }, select: { id: true } })
      if (!employee) throw new NotFoundException("Empleado no encontrado")

      const linkedUsers = await tx.user.findMany({
        where: { employeeId: id },
        select: { id: true, email: true }
      })
      const linkedUserIds = linkedUsers.map((user) => user.id)
      const linkedUserEmails = linkedUsers.map((user) => user.email)
      const movementRows = await tx.movement.findMany({ where: { employeeId: id }, select: { id: true } })
      const movementIds = movementRows.map((movement) => movement.id)
      const timeClockEntryRows = await tx.timeClockEntry.findMany({ where: { employeeId: id }, select: { id: true } })
      const timeClockEntryIds = timeClockEntryRows.map((entry) => entry.id)
      const workSessionRows = await tx.workSession.findMany({ where: { employeeId: id }, select: { id: true } })
      const workSessionIds = workSessionRows.map((session) => session.id)
      const payrollItemRows = await tx.payrollItem.findMany({
        where: { employeeId: id },
        select: { id: true, payrollId: true }
      })
      const payrollItemIds = payrollItemRows.map((item) => item.id)
      const payrollIds = Array.from(new Set(payrollItemRows.map((item) => item.payrollId)))

      if (linkedUserEmails.length) {
        await tx.loginThrottle.deleteMany({ where: { identifier: { in: linkedUserEmails } } })
      }

      await tx.auditLog.deleteMany({
        where: {
          OR: [
            { affectedEmployeeId: id },
            { entity: "Employee", entityId: id },
            ...(linkedUserIds.length
              ? [
                  { userId: { in: linkedUserIds } },
                  { entity: "User", entityId: { in: linkedUserIds } }
                ]
              : [])
          ]
        }
      })

      const payrollLinkClauses: Prisma.PayrollItemMovementWhereInput[] = []
      if (payrollItemIds.length) payrollLinkClauses.push({ payrollItemId: { in: payrollItemIds } })
      if (movementIds.length) payrollLinkClauses.push({ movementId: { in: movementIds } })

      if (payrollLinkClauses.length) {
        await tx.payrollItemMovement.deleteMany({
          where: { OR: payrollLinkClauses }
        })
      }

      await tx.attendanceAdjustment.deleteMany({
        where: {
          OR: [
            { employeeId: id },
            ...(timeClockEntryIds.length ? [{ entryId: { in: timeClockEntryIds } }] : []),
            ...(workSessionIds.length ? [{ workSessionId: { in: workSessionIds } }] : [])
          ]
        }
      })
      await tx.workSession.deleteMany({ where: { employeeId: id } })
      await tx.timeClockEntry.deleteMany({ where: { employeeId: id } })
      await tx.incident.updateMany({ where: { employeeId: id }, data: { employeeId: null } })
      await tx.payrollItem.deleteMany({ where: { employeeId: id } })
      await tx.movement.deleteMany({ where: { employeeId: id } })

      for (const linkedUser of linkedUsers) {
        await tx.user.update({
          where: { id: linkedUser.id },
          data: {
            fullName: "Usuario purgado",
            email: `purged-${linkedUser.id}@deleted.local`,
            passwordHash: await bcrypt.hash(`${linkedUser.id}:${Date.now()}`, 12),
            active: false,
            branchId: null,
            employeeId: null
          }
        })
      }

      await tx.employee.delete({ where: { id } })

      for (const payrollId of payrollIds) {
        const totals = await tx.payrollItem.aggregate({
          where: { payrollId },
          _sum: {
            baseSalary: true,
            totalDeductions: true,
            totalPositiveAdjustments: true,
            totalNegativeAdjustments: true,
            netPay: true
          }
        })
        const totalAdjustments = new Prisma.Decimal(totals._sum?.totalPositiveAdjustments ?? 0).minus(
          totals._sum?.totalNegativeAdjustments ?? 0
        )
        await tx.payroll.update({
          where: { id: payrollId },
          data: {
            totalGross: totals._sum?.baseSalary ?? new Prisma.Decimal(0),
            totalDeductions: totals._sum?.totalDeductions ?? new Prisma.Decimal(0),
            totalAdjustments,
            totalNet: totals._sum?.netPay ?? new Prisma.Decimal(0)
          }
        })
      }

      const summary = {
        employeeDeleted: true,
        linkedUsersAnonymized: linkedUsers.length,
        movementsDeleted: movementIds.length,
        timeClockEntriesDeleted: timeClockEntryIds.length,
        workSessionsDeleted: workSessionIds.length,
        payrollItemsDeleted: payrollItemIds.length,
        payrollsRecalculated: payrollIds.length,
        sensitiveDataStored: false
      }

      await tx.auditLog.create({
        data: {
          userId,
          action: AuditAction.DELETE,
          entity: "DeveloperEmployeePurge",
          entityId: id,
          newValue: summary,
          ipAddress
        }
      })

      return { employeeId: id, ...summary }
    })
  }

  private isDeveloperMaintenanceEnabled() {
    const value = this.config.get<string>("ENABLE_DEVELOPER_MAINTENANCE")
    return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase())
  }

  async balance(id: string, user: AuthUser) {
    const employee = await this.prisma.employee.findFirst({
      where: this.andEmployeeWhere(this.scopeForUser(user), { id }),
      select: { id: true }
    })
    if (!employee) throw new NotFoundException("Empleado no encontrado")

    const movements = await this.prisma.movement.groupBy({
      by: ["kind"],
      where: { employeeId: id, status: { in: balanceStatuses }, payrollLinks: { none: {} } },
      _sum: { amount: true }
    })
    const discounted = await this.prisma.movement.aggregate({
      where: { employeeId: id, status: { in: [MovementStatus.DISCOUNTED] } },
      _sum: { amount: true }
    })
    const sums = Object.fromEntries(movements.map((row) => [row.kind, Number(row._sum.amount ?? 0)]))
    const pending = Object.values(sums).reduce((total, value) => total + Number(value), 0)

    return {
      employeeId: id,
      advances: sums.SALARY_ADVANCE ?? 0,
      loans: sums.LOAN ?? 0,
      consumptions: (sums.INTERNAL_CONSUMPTION ?? 0) + (sums.DRINK ?? 0) + (sums.FOOD ?? 0),
      cashOut: sums.CASH_OUT ?? 0,
      discounted: Number(discounted._sum.amount ?? 0),
      pendingBalance: pending
    }
  }

  private scopeForUser(user: AuthUser): Prisma.EmployeeWhereInput {
    if (user.role === Role.EMPLEADO) {
      return { id: user.employeeId ?? "__none__" }
    }
    if (user.role === Role.CAJERO || user.role === Role.ENCARGADO) {
      return { branchId: user.branchId ?? "__none__" }
    }
    return {}
  }

  private async ensureBranchWritable(branchId: string | undefined, user: AuthUser) {
    const effectiveBranchId = branchId?.trim()
    if (!effectiveBranchId) throw new NotFoundException("Sucursal no encontrada")

    if (
      (user.role === Role.CAJERO || user.role === Role.ENCARGADO) &&
      user.branchId !== effectiveBranchId
    ) {
      throw new ForbiddenException("No puedes operar empleados de otra sucursal")
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: effectiveBranchId, active: true },
      select: { id: true }
    })
    if (!branch) throw new NotFoundException("Sucursal no encontrada")
    return branch.id
  }

  private andEmployeeWhere(...clauses: Prisma.EmployeeWhereInput[]): Prisma.EmployeeWhereInput {
    const effectiveClauses = clauses
      .map((clause) => this.definedEmployeeWhere(clause))
      .filter((clause) => Object.keys(clause).length > 0)

    if (effectiveClauses.length === 0) return {}
    if (effectiveClauses.length === 1) return effectiveClauses[0]
    return { AND: effectiveClauses }
  }

  private definedEmployeeWhere(where: Prisma.EmployeeWhereInput): Prisma.EmployeeWhereInput {
    const defined: Prisma.EmployeeWhereInput = {}

    for (const [key, value] of Object.entries(where)) {
      if (value !== undefined) {
        ;(defined as Record<string, unknown>)[key] = value
      }
    }

    return defined
  }

  private cleanEmployee(employee: { pinHash?: string } & Record<string, unknown>) {
    const { pinHash, ...safe } = employee
    void pinHash
    return safe as Prisma.InputJsonObject
  }

  private parseDate(value: string) {
    const date = new Date(`${value}T00:00:00`)
    return Number.isNaN(date.getTime()) ? undefined : date
  }
}
