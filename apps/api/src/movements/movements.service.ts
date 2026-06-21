import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { AuditAction, Employee, MovementKind, MovementOrigin, MovementStatus, Prisma, Role } from "@prisma/client"
import bcrypt from "bcryptjs"
import { PrismaService } from "../prisma/prisma.service"
import { AuditService } from "../audit/audit.service"
import { roleMeets } from "../auth/role-rank"
import { TimeClockService } from "../time-clock/time-clock.service"
import type { AuthUser } from "../auth/auth.types"

type CreateMovementInput = {
  employeeId: string
  kind: MovementKind
  amount: number
  reason?: string
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
  reason?: string
  productName?: string
  quantity?: number
  unitPrice?: number
  evidenceNote?: string
}

export type CreateEmployeeRequestInput = {
  kind: MovementKind
  amount: number
  reason?: string
  productName?: string
  quantity?: number
  unitPrice?: number
}

export type CreateTimeClockSalaryAdvanceInput = {
  employeeCode: string
  approverCode: string
  amount: number
  reason?: string
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
  delivered?: string
}

type SettlementRangeInput = {
  employeeId: string
  from?: string
  to?: string
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
  MovementKind.INTERNAL_CONSUMPTION,
  MovementKind.SHORTAGE_DISCOUNT,
  MovementKind.DAMAGE_DISCOUNT,
  MovementKind.BALANCE_CORRECTION,
]

const settlementStatuses: MovementStatus[] = [
  MovementStatus.AUTHORIZED,
  MovementStatus.PARTIALLY_DISCOUNTED
]

@Injectable()
export class MovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly timeClock: TimeClockService
  ) {}

  async list(filters: MovementFilters, user: AuthUser) {
    const movements = await this.prisma.movement.findMany({
      where: this.buildWhere(filters, user),
      include: {
        employee: { include: { branch: true } },
        registeredBy: { select: { id: true, fullName: true, role: true } },
        authorizedBy: { select: { id: true, fullName: true, role: true } },
        deliveredBy: { select: { id: true, fullName: true, role: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    })
    return this.withEvidenceFiles(movements)
  }

  async get(id: string, user: AuthUser) {
    const movement = await this.prisma.movement.findFirst({
      where: { id, ...this.scopeForUser(user) },
      include: {
        employee: { include: { branch: true } },
        registeredBy: { select: { id: true, fullName: true, role: true } },
        authorizedBy: { select: { id: true, fullName: true, role: true } },
        deliveredBy: { select: { id: true, fullName: true, role: true } }
      }
    })
    if (!movement) throw new NotFoundException("Movimiento no encontrado")
    return (await this.withEvidenceFiles([movement]))[0]
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

  async create(dto: CreateMovementInput, user: AuthUser, metadata: RequestMetadata = {}) {
    if (!standardMovementKinds.includes(dto.kind)) {
      throw new BadRequestException("Tipo de movimiento no permitido")
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: dto.employeeId,
        active: true,
        ...this.employeeWriteScopeForUser(user)
      },
      include: { branch: true }
    })
    if (!employee) throw new NotFoundException("Empleado no encontrado o inactivo")
    if (user.role === Role.EMPLEADO && user.employeeId !== employee.id) {
      throw new ForbiddenException("El empleado solo puede operar su propio registro")
    }

    const validPin = await bcrypt.compare(dto.employeePin, employee.pinHash)
    if (!validPin) throw new BadRequestException("PIN del empleado invalido")

    if (dto.kind !== MovementKind.DRINK && (!dto.reason || dto.reason.trim().length === 0)) {
      throw new BadRequestException("El motivo es requerido")
    }

    await this.timeClock.ensureEmployeeHasActiveShiftToday(employee.id, dto.kind, {
      ...metadata,
      userId: user.sub,
      context: "admin-movement"
    })

    const config = await this.getConfig()
    const amount = this.resolveAmount(dto, config)
    const isAdvance = dto.kind === MovementKind.SALARY_ADVANCE || dto.kind === MovementKind.ADMIN_SALARY_ADVANCE
    const status = isAdvance ? MovementStatus.PENDING : MovementStatus.AUTHORIZED
    const authorizedById = status === MovementStatus.AUTHORIZED ? user.sub : null
    const authorizedAt = status === MovementStatus.AUTHORIZED ? new Date() : null

    const movement = await this.prisma.movement.create({
      data: {
        folio: await this.nextFolio(),
        employeeId: employee.id,
        branchId: employee.branchId,
        kind: dto.kind,
        origin: MovementOrigin.ADMINISTRATIVE_ACTION,
        amount,
        reason: dto.kind === MovementKind.DRINK ? (dto.reason?.trim() || "Bebida") : dto.reason!,
        status,
        authorizedById,
        authorizedAt,
        productName: dto.kind === MovementKind.DRINK ? "Bebida" : dto.productName,
        quantity: dto.kind === MovementKind.DRINK ? 1 : dto.quantity,
        unitPrice: dto.kind === MovementKind.DRINK ? config.beveragePrice : dto.unitPrice,
        evidenceNote: dto.evidenceNote,
        receiptText: config.receiptLegalText,
        requestIp: metadata.ipAddress,
        requestUserAgent: metadata.userAgent,
        requestDevice: metadata.device,
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
      ipAddress: metadata.ipAddress
    })

    return movement
  }

  async createAdministrative(dto: CreateAdministrativeMovementInput, user: AuthUser, metadata: RequestMetadata = {}) {
    if (!administrativeKinds.includes(dto.kind)) {
      throw new BadRequestException("Tipo administrativo no permitido")
    }

    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } })
    if (!employee?.active) throw new NotFoundException("Empleado no encontrado o inactivo")

    if (dto.kind !== MovementKind.DRINK && (!dto.reason || dto.reason.trim().length === 0)) {
      throw new BadRequestException("El motivo es requerido")
    }

    await this.timeClock.ensureEmployeeHasActiveShiftToday(employee.id, dto.kind, {
      ...metadata,
      userId: user.sub,
      context: "admin-administrative-movement"
    })

    const config = await this.getConfig()
    const amount = this.resolveAmount(dto, config)
    const isAdvance = dto.kind === MovementKind.SALARY_ADVANCE || dto.kind === MovementKind.ADMIN_SALARY_ADVANCE
    const status = isAdvance ? MovementStatus.PENDING : MovementStatus.AUTHORIZED
    const authorizedById = status === MovementStatus.AUTHORIZED ? user.sub : null
    const authorizedAt = status === MovementStatus.AUTHORIZED ? new Date() : null

    const movement = await this.prisma.movement.create({
      data: {
        folio: await this.nextFolio(),
        employeeId: employee.id,
        branchId: employee.branchId,
        kind: dto.kind,
        origin: MovementOrigin.ADMINISTRATIVE_ACTION,
        amount,
        reason: dto.kind === MovementKind.DRINK ? (dto.reason?.trim() || "Bebida") : dto.reason!,
        status,
        authorizedById,
        authorizedAt,
        productName: dto.productName,
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        evidenceNote: dto.evidenceNote,
        receiptText: config.receiptLegalText,
        requestIp: metadata.ipAddress,
        requestUserAgent: metadata.userAgent,
        requestDevice: metadata.device,
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
      ipAddress: metadata.ipAddress
    })

    return movement
  }

  async createEmployeeRequest(dto: CreateEmployeeRequestInput, employee: Employee, metadata: RequestMetadata) {
    if (!employeeRequestKinds.includes(dto.kind)) {
      throw new BadRequestException("Tipo de solicitud no permitido para empleado")
    }

    if (dto.kind !== MovementKind.DRINK && (!dto.reason || dto.reason.trim().length === 0)) {
      throw new BadRequestException("El motivo es requerido")
    }

    const config = await this.getConfig()
    const amount = this.resolveAmount(dto, config)
    const isAdvance = dto.kind === MovementKind.SALARY_ADVANCE
    const status = isAdvance ? MovementStatus.PENDING : MovementStatus.AUTHORIZED
    const authorizedAt = status === MovementStatus.AUTHORIZED ? new Date() : null

    await this.timeClock.ensureEmployeeHasActiveShiftToday(employee.id, dto.kind, {
      ...metadata,
      context: "employee-portal-request"
    })

    const movement = await this.prisma.movement.create({
      data: {
        folio: await this.nextFolio(),
        employeeId: employee.id,
        branchId: employee.branchId,
        kind: dto.kind,
        origin: MovementOrigin.EMPLOYEE_REQUEST,
        amount,
        reason: dto.kind === MovementKind.DRINK ? (dto.reason?.trim() || "Bebida") : dto.reason!,
        status,
        authorizedAt,
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

  async createTimeClockSalaryAdvance(
    token: string | undefined,
    dto: CreateTimeClockSalaryAdvanceInput,
    metadata: RequestMetadata
  ) {
    if (!Number.isFinite(dto.amount) || dto.amount <= 0 || dto.amount > 50_000) {
      throw new BadRequestException("El adelanto debe ser mayor a $0 y no exceder $50,000")
    }

    const { device, employee, approver } = await this.timeClock.authorizeSalaryAdvanceRequest(token, dto, metadata)
    await this.timeClock.ensureEmployeeHasActiveShiftToday(employee.id, MovementKind.SALARY_ADVANCE, {
      ...metadata,
      userId: approver.id,
      device: `time-clock:${device.id}`,
      context: "time-clock-salary-advance"
    })

    const amount = Number(dto.amount.toFixed(2))
    const duplicateSince = new Date(Date.now() - 2 * 60_000)
    const duplicate = await this.prisma.movement.findFirst({
      where: {
        employeeId: employee.id,
        kind: MovementKind.SALARY_ADVANCE,
        amount,
        requestDevice: `time-clock:${device.id}`,
        createdAt: { gte: duplicateSince },
        status: { notIn: [MovementStatus.REJECTED, MovementStatus.CANCELED] }
      },
      select: { id: true }
    })
    if (duplicate) throw new BadRequestException("Este adelanto ya fue registrado recientemente")

    const config = await this.getConfig()
    const movement = await this.prisma.movement.create({
      data: {
        folio: await this.nextFolio(),
        employeeId: employee.id,
        branchId: employee.branchId,
        kind: MovementKind.SALARY_ADVANCE,
        origin: MovementOrigin.EMPLOYEE_REQUEST,
        amount,
        reason: dto.reason?.trim() || "Adelanto solicitado desde reloj checador",
        status: MovementStatus.AUTHORIZED,
        authorizedById: approver.id,
        authorizedAt: new Date(),
        receiptText: config.receiptLegalText,
        requestIp: metadata.ipAddress,
        requestUserAgent: metadata.userAgent,
        requestDevice: `time-clock:${device.id}`
      },
      include: {
        employee: { select: { id: true, fullName: true, position: true } },
        authorizedBy: { select: { id: true, fullName: true, role: true } }
      }
    })

    await this.audit.log({
      userId: approver.id,
      action: AuditAction.CREATE,
      entity: "Movement",
      entityId: movement.id,
      affectedEmployeeId: employee.id,
      newValue: this.toJson({ ...movement, source: "time-clock-salary-advance", deviceId: device.id }),
      ipAddress: metadata.ipAddress
    })
    return movement
  }

  async authorize(id: string, user: AuthUser, ipAddress?: string) {
    const movement = await this.findVisibleMovementForWrite(id, user)
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

  async deliver(id: string, user: AuthUser, ipAddress?: string) {
    const movement = await this.findVisibleMovementForWrite(id, user)
    if (!movement) throw new NotFoundException("Movimiento no encontrado")
    if (movement.status !== MovementStatus.AUTHORIZED) {
      throw new BadRequestException("Solo se pueden entregar movimientos autorizados")
    }
    if (movement.deliveredAt) {
      throw new BadRequestException("Este movimiento ya fue entregado")
    }

    const updated = await this.prisma.movement.update({
      where: { id },
      data: {
        deliveredById: user.sub,
        deliveredAt: new Date()
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
    const movement = await this.prisma.movement.findFirst({
      where: this.andWhere(this.scopeForUser(user), { id }),
      select: { id: true, folio: true, employeeId: true, kind: true, amount: true, reason: true, status: true, createdAt: true }
    })
    if (!movement) throw new NotFoundException("Movimiento no encontrado")
    if (movement.status === MovementStatus.DISCOUNTED) {
      return this.prisma.movement.findUniqueOrThrow({ where: { id } })
    }

    const ticketNumber = await this.nextSettlementTicketNumber()
    const total = Number(movement.amount)
    const byKind = this.summarizeMovementsByKind([movement])
    const movementDate = movement.createdAt.toISOString().slice(0, 10)
    const settledAt = new Date()
    const ticket = {
      ticketNumber,
      employeeId: movement.employeeId,
      from: movementDate,
      to: movementDate,
      settledAt,
      status: MovementStatus.DISCOUNTED,
      count: 1,
      total,
      byKind,
      movements: [{
        id: movement.id,
        folio: movement.folio,
        kind: movement.kind,
        amount: total,
        reason: movement.reason,
        createdAt: movement.createdAt
      }]
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const discounted = await tx.movement.update({
        where: { id },
        data: { status: MovementStatus.DISCOUNTED }
      })
      await tx.auditLog.create({
        data: {
          userId: user.sub,
          action: AuditAction.STATUS_CHANGE,
          entity: "Movement",
          entityId: id,
          affectedEmployeeId: movement.employeeId,
          oldValue: this.toJson(movement),
          newValue: this.toJson(discounted),
          ipAddress
        }
      })
      await tx.auditLog.create({
        data: {
          userId: user.sub,
          action: AuditAction.STATUS_CHANGE,
          entity: "MovementSettlement",
          entityId: movement.employeeId,
          affectedEmployeeId: movement.employeeId,
          newValue: this.toJson({
            ...ticket,
            movementIds: [movement.id],
            folios: [movement.folio]
          }),
          ipAddress
        }
      })
      return discounted
    })

    return updated
  }

  async settlementSummary(input: SettlementRangeInput, user: AuthUser) {
    await this.ensureEmployeeVisible(input.employeeId, user)
    const where = this.buildSettlementWhere(input, user)
    const [movements, total] = await Promise.all([
      this.prisma.movement.groupBy({
        by: ["kind"],
        where,
        _count: { _all: true },
        _sum: { amount: true }
      }),
      this.prisma.movement.aggregate({
        where,
        _sum: { amount: true },
        _count: { _all: true }
      })
    ])

    return {
      employeeId: input.employeeId,
      from: input.from,
      to: input.to,
      count: total._count._all,
      total: Number(total._sum.amount ?? 0),
      byKind: movements.map((row) => ({
        kind: row.kind,
        count: row._count._all,
        amount: Number(row._sum.amount ?? 0)
      }))
    }
  }

  async settleEmployeeRange(input: SettlementRangeInput, user: AuthUser, ipAddress?: string) {
    if (!input.from || !input.to) {
      throw new BadRequestException("Rango de fechas requerido para liquidar")
    }
    await this.ensureEmployeeVisible(input.employeeId, user)
    const where = this.buildSettlementWhere(input, user)
    const movements = await this.prisma.movement.findMany({
      where,
      select: { id: true, folio: true, employeeId: true, kind: true, amount: true, reason: true, status: true, createdAt: true }
    })

    if (!movements.length) {
      return {
        employeeId: input.employeeId,
        from: input.from,
        to: input.to,
        count: 0,
        total: 0
      }
    }

    const ids = movements.map((movement) => movement.id)
    const total = movements.reduce((sum, movement) => sum + Number(movement.amount), 0)
    const byKind = this.summarizeMovementsByKind(movements)
    const ticketNumber = await this.nextSettlementTicketNumber()
    const settledAt = new Date()
    const ticket = {
      ticketNumber,
      employeeId: input.employeeId,
      from: input.from,
      to: input.to,
      settledAt,
      status: MovementStatus.DISCOUNTED,
      count: movements.length,
      total,
      byKind,
      movements: movements.map((movement) => ({
        id: movement.id,
        folio: movement.folio,
        kind: movement.kind,
        amount: Number(movement.amount),
        reason: movement.reason,
        createdAt: movement.createdAt
      }))
    }

    await this.prisma.$transaction([
      this.prisma.movement.updateMany({
        where: { id: { in: ids } },
        data: { status: MovementStatus.DISCOUNTED }
      }),
      this.prisma.auditLog.create({
        data: {
          userId: user.sub,
          action: AuditAction.STATUS_CHANGE,
          entity: "MovementSettlement",
          entityId: input.employeeId,
          affectedEmployeeId: input.employeeId,
          newValue: this.toJson({
            ...ticket,
            movementIds: ids,
            folios: movements.map((movement) => movement.folio)
          }),
          ipAddress
        }
      })
    ])

    return {
      employeeId: input.employeeId,
      from: input.from,
      to: input.to,
      ticketNumber,
      settledAt,
      count: movements.length,
      total,
      byKind,
      movements: ticket.movements
    }
  }

  private async changeStatus(
    id: string,
    status: MovementStatus,
    action: AuditAction,
    user: AuthUser,
    ipAddress?: string
  ) {
    const movement = await this.findVisibleMovementForWrite(id, user)
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

  private async nextSettlementTicketNumber() {
    const now = new Date()
    const prefix = `LIQ-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`
    const count = await this.prisma.auditLog.count({
      where: {
        entity: "MovementSettlement",
        createdAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        }
      }
    })
    return `${prefix}-${String(count + 1).padStart(4, "0")}`
  }

  private summarizeMovementsByKind(movements: Array<{ kind: MovementKind; amount: Prisma.Decimal | number }>) {
    const summary = new Map<MovementKind, { kind: MovementKind; count: number; amount: number }>()
    for (const movement of movements) {
      const current = summary.get(movement.kind) ?? { kind: movement.kind, count: 0, amount: 0 }
      current.count += 1
      current.amount += Number(movement.amount)
      summary.set(movement.kind, current)
    }
    return Array.from(summary.values()).map((item) => ({
      ...item,
      amount: Number(item.amount.toFixed(2))
    }))
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
    const clientWhere = this.definedWhere({
      employeeId: filters.employeeId,
      branchId: filters.branchId,
      kind: filters.kind,
      status: filters.status ?? { not: MovementStatus.DISCOUNTED },
      deliveredAt: filters.delivered === "true"
        ? { not: null }
        : filters.delivered === "false"
          ? null
          : undefined,
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
    })

    return this.andWhere(this.scopeForUser(user), clientWhere)
  }

  private buildSettlementWhere(input: SettlementRangeInput, user: AuthUser): Prisma.MovementWhereInput {
    const range = this.dateRange(input.from, input.to)
    const clientWhere = this.definedWhere({
      employeeId: input.employeeId,
      status: { in: settlementStatuses },
      createdAt: range
    })

    return this.andWhere(this.scopeForUser(user), clientWhere)
  }

  private andWhere(...clauses: Prisma.MovementWhereInput[]): Prisma.MovementWhereInput {
    const effectiveClauses = clauses
      .map((clause) => this.definedWhere(clause))
      .filter((clause) => Object.keys(clause).length > 0)

    if (effectiveClauses.length === 0) return {}
    if (effectiveClauses.length === 1) return effectiveClauses[0]
    return { AND: effectiveClauses }
  }

  private definedWhere(where: Prisma.MovementWhereInput): Prisma.MovementWhereInput {
    const defined: Prisma.MovementWhereInput = {}

    for (const [key, value] of Object.entries(where)) {
      if (value !== undefined) {
        ;(defined as Record<string, unknown>)[key] = value
      }
    }

    return defined
  }

  private async ensureEmployeeVisible(employeeId: string, user: AuthUser) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        active: true,
        ...(user.role === Role.CAJERO || user.role === Role.ENCARGADO
          ? { branchId: user.branchId ?? "__none__" }
          : {}),
        ...(user.role === Role.EMPLEADO ? { id: user.employeeId ?? "__none__" } : {})
      },
      select: { id: true }
    })
    if (!employee) throw new NotFoundException("Empleado no encontrado o fuera de alcance")
  }

  private dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) return undefined
    const range: Prisma.DateTimeFilter = {}
    if (from) range.gte = this.startOfDay(from)
    if (to) range.lt = this.nextDay(to)
    return range
  }

  private startOfDay(value: string) {
    const date = new Date(value)
    date.setHours(0, 0, 0, 0)
    return date
  }

  private nextDay(value: string) {
    const date = this.startOfDay(value)
    date.setDate(date.getDate() + 1)
    return date
  }

  private scopeForUser(user: AuthUser): Prisma.MovementWhereInput {
    if (user.role === Role.EMPLEADO) {
      return { employeeId: user.employeeId ?? "__none__", status: { in: employeeVisibleStatuses } }
    }
    if (user.role === Role.CAJERO || user.role === Role.ENCARGADO) {
      return { branchId: user.branchId ?? "__none__" }
    }
    return {}
  }

  private employeeWriteScopeForUser(user: AuthUser): Prisma.EmployeeWhereInput {
    if (user.role === Role.EMPLEADO) {
      return { id: user.employeeId ?? "__none__" }
    }
    if (user.role === Role.CAJERO || user.role === Role.ENCARGADO) {
      return { branchId: user.branchId ?? "__none__" }
    }
    return {}
  }

  private findVisibleMovementForWrite(id: string, user: AuthUser) {
    return this.prisma.movement.findFirst({
      where: this.andWhere(this.scopeForUser(user), { id })
    })
  }

  private async withEvidenceFiles<T extends { id: string }>(movements: T[]) {
    if (!movements.length) return movements
    const files = await this.prisma.fileAsset.findMany({
      where: {
        module: "TIMECLOCK",
        entityId: { in: movements.map((movement) => movement.id) },
        deletedAt: null
      }
    })
    const filesByEntity = new Map(files.map((file) => [file.entityId, file]))
    return movements.map((movement) => ({
      ...movement,
      evidenceFile: filesByEntity.get(movement.id) ?? null
    }))
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
  }
}
