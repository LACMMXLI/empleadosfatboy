import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { AuditAction, Employee, MovementKind, MovementOrigin, MovementStatus, Prisma, Role } from "@prisma/client"
import bcrypt from "bcryptjs"
import { PrismaService } from "../prisma/prisma.service"
import { AuditService } from "../audit/audit.service"
import { roleMeets } from "../auth/role-rank"
import type { AuthUser } from "../auth/auth.types"

type CreateMovementInput = {
  employeeId: string
  kind: MovementKind
  amount: number
  reason: string
  employeePin: string
  productName?: string
  quantity?: number
  unitPrice?: number
  evidenceNote?: string
}

type CreateAdministrativeMovementInput = {
  employeeId: string
  kind: MovementKind
  amount: number
  reason: string
  productName?: string
  quantity?: number
  unitPrice?: number
  evidenceNote?: string
}

export type CreateEmployeeRequestInput = {
  kind: MovementKind
  amount: number
  reason: string
  productName?: string
  quantity?: number
  unitPrice?: number
}

export type RequestMetadata = {
  ipAddress?: string
  userAgent?: string
  device?: string
}

type MovementFilters = {
  employeeId?: string
  branchId?: string
  kind?: MovementKind
  status?: MovementStatus
  from?: string
  to?: string
  q?: string
}

const employeeVisibleStatuses = [
  MovementStatus.PENDING,
  MovementStatus.AUTHORIZED,
  MovementStatus.DISCOUNTED,
  MovementStatus.PARTIALLY_DISCOUNTED,
  MovementStatus.REJECTED,
  MovementStatus.CANCELED
]

const employeeRequestKinds: MovementKind[] = [
  MovementKind.SALARY_ADVANCE,
  MovementKind.DRINK,
  MovementKind.INTERNAL_CONSUMPTION
]

const standardMovementKinds: MovementKind[] = [
  MovementKind.SALARY_ADVANCE,
  MovementKind.DRINK,
  MovementKind.INTERNAL_CONSUMPTION
]

const administrativeKinds: MovementKind[] = [
  MovementKind.ADMIN_ADJUSTMENT,
  MovementKind.ADMIN_CHARGE,
  MovementKind.SHORTAGE_DISCOUNT,
  MovementKind.DAMAGE_DISCOUNT,
  MovementKind.CASH_OUT,
  MovementKind.BALANCE_CORRECTION,
  MovementKind.ADMIN_SALARY_ADVANCE,
  MovementKind.ADMIN_LOAN
]

@Injectable()
export class MovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(filters: MovementFilters, user: AuthUser) {
    return this.prisma.movement.findMany({
      where: this.buildWhere(filters, user),
      include: {
        employee: { include: { branch: true } },
        registeredBy: { select: { id: true, fullName: true, role: true } },
        authorizedBy: { select: { id: true, fullName: true, role: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    })
  }

  async get(id: string, user: AuthUser) {
    const movement = await this.prisma.movement.findFirst({
      where: { id, ...this.scopeForUser(user) },
      include: {
        employee: { include: { branch: true } },
        registeredBy: { select: { id: true, fullName: true, role: true } },
        authorizedBy: { select: { id: true, fullName: true, role: true } }
      }
    })
    if (!movement) throw new NotFoundException("Movimiento no encontrado")
    return movement
  }

  async receipt(id: string, user: AuthUser) {
    const movement = await this.get(id, user)
    return {
      folio: movement.folio,
      date: movement.createdAt,
      employee: movement.employee.fullName,
      amount: movement.amount,
      kind: movement.kind,
      reason: movement.reason,
      registeredBy: movement.registeredBy?.fullName,
      authorizedBy: movement.authorizedBy?.fullName,
      receiptText: movement.receiptText,
      status: movement.status
    }
  }

  async auditTrail(id: string, user: AuthUser) {
    const movement = await this.prisma.movement.findFirst({
      where: { id, ...this.scopeForUser(user) },
      select: { id: true }
    })
    if (!movement) throw new NotFoundException("Movimiento no encontrado")

    return this.prisma.auditLog.findMany({
      where: { entity: "Movement", entityId: id },
      include: { user: { select: { id: true, fullName: true, role: true } } },
      orderBy: { createdAt: "asc" }
    })
  }

  async create(dto: CreateMovementInput, user: AuthUser, ipAddress?: string) {
    if (!standardMovementKinds.includes(dto.kind)) {
      throw new BadRequestException("Tipo de movimiento no permitido")
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      include: { branch: true }
    })
    if (!employee?.active) throw new NotFoundException("Empleado no encontrado o inactivo")
    if (user.role === Role.EMPLEADO && user.employeeId !== employee.id) {
      throw new ForbiddenException("El empleado solo puede operar su propio registro")
    }

    const validPin = await bcrypt.compare(dto.employeePin, employee.pinHash)
    if (!validPin) throw new BadRequestException("PIN del empleado invalido")

    const config = await this.getConfig()
    const amount = this.resolveAmount(dto, config)
    const movement = await this.prisma.movement.create({
      data: {
        folio: await this.nextFolio(),
        employeeId: employee.id,
        branchId: employee.branchId,
        kind: dto.kind,
        origin: MovementOrigin.ADMINISTRATIVE_ACTION,
        amount,
        reason: dto.reason,
        productName: dto.kind === MovementKind.DRINK ? "Bebida" : dto.productName,
        quantity: dto.kind === MovementKind.DRINK ? 1 : dto.quantity,
        unitPrice: dto.kind === MovementKind.DRINK ? config.beveragePrice : dto.unitPrice,
        evidenceNote: dto.evidenceNote,
        receiptText: config.receiptLegalText,
        requestIp: ipAddress,
        registeredById: user.sub
      }
    })

    await this.audit.log({
      userId: user.sub,
      action: AuditAction.CREATE,
      entity: "Movement",
      entityId: movement.id,
      affectedEmployeeId: employee.id,
      newValue: this.toJson(movement),
      ipAddress
    })

    return movement
  }

  async createAdministrative(dto: CreateAdministrativeMovementInput, user: AuthUser, ipAddress?: string) {
    if (!administrativeKinds.includes(dto.kind)) {
      throw new BadRequestException("Tipo administrativo no permitido")
    }

    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } })
    if (!employee?.active) throw new NotFoundException("Empleado no encontrado o inactivo")

    const config = await this.getConfig()
    const amount = this.resolveAmount(dto, config)
    const movement = await this.prisma.movement.create({
      data: {
        folio: await this.nextFolio(),
        employeeId: employee.id,
        branchId: employee.branchId,
        kind: dto.kind,
        origin: MovementOrigin.ADMINISTRATIVE_ACTION,
        amount,
        reason: dto.reason,
        productName: dto.productName,
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        evidenceNote: dto.evidenceNote,
        receiptText: config.receiptLegalText,
        requestIp: ipAddress,
        registeredById: user.sub
      }
    })

    await this.audit.log({
      userId: user.sub,
      action: AuditAction.CREATE,
      entity: "Movement",
      entityId: movement.id,
      affectedEmployeeId: employee.id,
      newValue: this.toJson(movement),
      ipAddress
    })

    return movement
  }

  async createEmployeeRequest(dto: CreateEmployeeRequestInput, employee: Employee, metadata: RequestMetadata) {
    if (!employeeRequestKinds.includes(dto.kind)) {
      throw new BadRequestException("Tipo de solicitud no permitido para empleado")
    }

    const config = await this.getConfig()
    const amount = this.resolveAmount(dto, config)
    const movement = await this.prisma.movement.create({
      data: {
        folio: await this.nextFolio(),
        employeeId: employee.id,
        branchId: employee.branchId,
        kind: dto.kind,
        origin: MovementOrigin.EMPLOYEE_REQUEST,
        amount,
        reason: dto.reason,
        productName: dto.kind === MovementKind.DRINK ? "Bebida" : dto.productName,
        quantity: dto.kind === MovementKind.DRINK ? 1 : dto.quantity,
        unitPrice: dto.kind === MovementKind.DRINK ? config.beveragePrice : dto.unitPrice,
        receiptText: config.receiptLegalText,
        requestIp: metadata.ipAddress,
        requestUserAgent: metadata.userAgent,
        requestDevice: metadata.device
      }
    })

    await this.audit.log({
      action: AuditAction.CREATE,
      entity: "Movement",
      entityId: movement.id,
      affectedEmployeeId: employee.id,
      newValue: this.toJson({
        ...movement,
        requestUserAgent: metadata.userAgent,
        requestDevice: metadata.device
      }),
      ipAddress: metadata.ipAddress
    })

    return movement
  }

  async authorize(id: string, user: AuthUser, ipAddress?: string) {
    const movement = await this.prisma.movement.findUnique({ where: { id } })
    if (!movement) throw new NotFoundException("Movimiento no encontrado")
    if (movement.status !== MovementStatus.PENDING) {
      throw new BadRequestException("Solo se pueden autorizar movimientos pendientes")
    }

    const rule = await this.findRule(movement.kind, Number(movement.amount))
    if (!roleMeets(user.role, rule.requiredRole)) {
      throw new ForbiddenException(`Este movimiento requiere rol ${rule.requiredRole}`)
    }

    const updated = await this.prisma.movement.update({
      where: { id },
      data: {
        status: MovementStatus.AUTHORIZED,
        authorizedById: user.sub,
        authorizedAt: new Date()
      }
    })
    await this.audit.log({
      userId: user.sub,
      action: AuditAction.STATUS_CHANGE,
      entity: "Movement",
      entityId: id,
      affectedEmployeeId: movement.employeeId,
      oldValue: this.toJson(movement),
      newValue: this.toJson(updated),
      ipAddress
    })
    return updated
  }

  async reject(id: string, user: AuthUser, ipAddress?: string) {
    return this.changeStatus(id, MovementStatus.REJECTED, AuditAction.STATUS_CHANGE, user, ipAddress)
  }

  async cancel(id: string, user: AuthUser, ipAddress?: string) {
    const movement = await this.prisma.movement.findUnique({ where: { id } })
    if (!movement) throw new NotFoundException("Movimiento no encontrado")
    if (movement.status === MovementStatus.CANCELED) return movement

    const updated = await this.prisma.movement.update({
      where: { id },
      data: { status: MovementStatus.CANCELED, canceledAt: new Date() }
    })
    await this.audit.log({
      userId: user.sub,
      action: AuditAction.CANCEL,
      entity: "Movement",
      entityId: id,
      affectedEmployeeId: movement.employeeId,
      oldValue: this.toJson(movement),
      newValue: this.toJson(updated),
      ipAddress
    })
    return updated
  }

  async markDiscounted(id: string, user: AuthUser, ipAddress?: string) {
    return this.changeStatus(id, MovementStatus.DISCOUNTED, AuditAction.STATUS_CHANGE, user, ipAddress)
  }

  private async changeStatus(
    id: string,
    status: MovementStatus,
    action: AuditAction,
    user: AuthUser,
    ipAddress?: string
  ) {
    const movement = await this.prisma.movement.findUnique({ where: { id } })
    if (!movement) throw new NotFoundException("Movimiento no encontrado")
    const updated = await this.prisma.movement.update({ where: { id }, data: { status } })
    await this.audit.log({
      userId: user.sub,
      action,
      entity: "Movement",
      entityId: id,
      affectedEmployeeId: movement.employeeId,
      oldValue: this.toJson(movement),
      newValue: this.toJson(updated),
      ipAddress
    })
    return updated
  }

  private async nextFolio() {
    const now = new Date()
    const prefix = `MOV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`
    const count = await this.prisma.movement.count({
      where: {
        createdAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        }
      }
    })
    return `${prefix}-${String(count + 1).padStart(4, "0")}`
  }

  private resolveAmount(
    dto: { kind: MovementKind; amount: number; quantity?: number; unitPrice?: number },
    config: { beveragePrice: Prisma.Decimal | number }
  ) {
    if (dto.kind === MovementKind.DRINK) {
      return Number(config.beveragePrice)
    }
    if (dto.kind === MovementKind.INTERNAL_CONSUMPTION && dto.quantity && dto.unitPrice) {
      return Number((dto.quantity * dto.unitPrice).toFixed(2))
    }
    return Number(dto.amount.toFixed(2))
  }

  private async getConfig() {
    return this.prisma.systemConfig.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" }
    })
  }

  private async findRule(kind: MovementKind, amount: number) {
    const kindRule = await this.prisma.authorizationRule.findFirst({
      where: {
        active: true,
        kind,
        minAmount: { lte: amount },
        OR: [{ maxAmount: null }, { maxAmount: { gte: amount } }]
      },
      orderBy: { minAmount: "desc" }
    })
    if (kindRule) return kindRule

    const rule = await this.prisma.authorizationRule.findFirst({
      where: {
        active: true,
        kind: null,
        minAmount: { lte: amount },
        OR: [{ maxAmount: null }, { maxAmount: { gte: amount } }]
      },
      orderBy: { minAmount: "desc" }
    })
    if (!rule) throw new BadRequestException("No hay regla de autorizacion para este monto")
    return rule
  }

  private buildWhere(filters: MovementFilters, user: AuthUser): Prisma.MovementWhereInput {
    return {
      ...this.scopeForUser(user),
      employeeId: filters.employeeId,
      branchId: filters.branchId,
      kind: filters.kind,
      status: filters.status,
      createdAt:
        filters.from || filters.to
          ? {
              gte: filters.from ? new Date(filters.from) : undefined,
              lte: filters.to ? new Date(filters.to) : undefined
            }
          : undefined,
      OR: filters.q
        ? [
            { folio: { contains: filters.q, mode: "insensitive" } },
            { reason: { contains: filters.q, mode: "insensitive" } },
            { employee: { fullName: { contains: filters.q, mode: "insensitive" } } },
            { employee: { phone: { contains: filters.q, mode: "insensitive" } } }
          ]
        : undefined
    }
  }

  private scopeForUser(user: AuthUser): Prisma.MovementWhereInput {
    if (user.role === Role.EMPLEADO) {
      return { employeeId: user.employeeId ?? "__none__", status: { in: employeeVisibleStatuses } }
    }
    if (user.role === Role.CAJERO || user.role === Role.ENCARGADO) {
      return { branchId: user.branchId ?? undefined }
    }
    return {}
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
  }
}
