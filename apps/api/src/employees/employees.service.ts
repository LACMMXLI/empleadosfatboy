import { Injectable, NotFoundException } from "@nestjs/common"
import { AuditAction, MovementStatus, Prisma } from "@prisma/client"
import bcrypt from "bcryptjs"
import { PrismaService } from "../prisma/prisma.service"
import { AuditService } from "../audit/audit.service"

type EmployeeWrite = {
  fullName?: string
  pin?: string
  position?: string
  branchId?: string
  phone?: string
  active?: boolean
}

const balanceStatuses: MovementStatus[] = [
  MovementStatus.AUTHORIZED,
  MovementStatus.PARTIALLY_DISCOUNTED
]

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  list(filters: { q?: string; branchId?: string; includeInactive?: boolean }) {
    return this.prisma.employee.findMany({
      where: {
        active: filters.includeInactive ? undefined : true,
        branchId: filters.branchId,
        OR: filters.q
          ? [
              { fullName: { contains: filters.q, mode: "insensitive" } },
              { position: { contains: filters.q, mode: "insensitive" } },
              { phone: { contains: filters.q, mode: "insensitive" } }
            ]
          : undefined
      },
      include: { branch: true },
      orderBy: { fullName: "asc" },
      take: 50
    })
  }

  async get(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
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

  async create(dto: Required<Pick<EmployeeWrite, "fullName" | "pin" | "position" | "branchId" | "phone">>, userId: string, ipAddress?: string) {
    const employee = await this.prisma.employee.create({
      data: {
        fullName: dto.fullName,
        pinHash: await bcrypt.hash(dto.pin, 12),
        position: dto.position,
        branchId: dto.branchId,
        phone: dto.phone
      }
    })
    await this.audit.log({
      userId,
      action: AuditAction.CREATE,
      entity: "Employee",
      entityId: employee.id,
      newValue: this.cleanEmployee(employee),
      ipAddress
    })
    return employee
  }

  async update(id: string, dto: EmployeeWrite, userId: string, ipAddress?: string) {
    const before = await this.prisma.employee.findUnique({ where: { id } })
    if (!before) throw new NotFoundException("Empleado no encontrado")

    const data: Prisma.EmployeeUpdateInput = {
      fullName: dto.fullName,
      position: dto.position,
      phone: dto.phone,
      active: dto.active,
      branch: dto.branchId ? { connect: { id: dto.branchId } } : undefined
    }
    if (dto.pin) data.pinHash = await bcrypt.hash(dto.pin, 12)

    const employee = await this.prisma.employee.update({ where: { id }, data })
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

  async balance(id: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id } })
    if (!employee) throw new NotFoundException("Empleado no encontrado")

    const movements = await this.prisma.movement.groupBy({
      by: ["kind"],
      where: { employeeId: id, status: { in: balanceStatuses } },
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

  private cleanEmployee(employee: { pinHash?: string } & Record<string, unknown>) {
    const { pinHash, ...safe } = employee
    void pinHash
    return safe as Prisma.InputJsonObject
  }
}
