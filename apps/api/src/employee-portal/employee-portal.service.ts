import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { AuditAction, MovementOrigin, MovementStatus, Prisma } from "@prisma/client"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { AuditService } from "../audit/audit.service"
import { PrismaService } from "../prisma/prisma.service"
import { MovementsService, RequestMetadata, type CreateEmployeeRequestInput } from "../movements/movements.service"

type PortalToken = {
  sub: string
  portal: "employee"
}

type PortalLoginInput = {
  phone: string
  pin: string
}

@Injectable()
export class EmployeePortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly movementsService: MovementsService
  ) {}

  async login(dto: PortalLoginInput, metadata: RequestMetadata) {
    const phone = dto.phone.trim()
    const employee = await this.prisma.employee.findFirst({
      where: {
        active: true,
        phone
      },
      include: { branch: true }
    })
    if (!employee) throw new UnauthorizedException("Teléfono o código inválido")

    const validPin = await bcrypt.compare(dto.pin, employee.pinHash)
    if (!validPin) throw new UnauthorizedException("Teléfono o código inválido")

    await this.audit.log({
      action: AuditAction.LOGIN,
      entity: "EmployeePortal",
      entityId: employee.id,
      affectedEmployeeId: employee.id,
      newValue: this.toJson({ phone, device: metadata.device, userAgent: metadata.userAgent }),
      ipAddress: metadata.ipAddress
    })

    const token = jwt.sign(
      { sub: employee.id, portal: "employee" } satisfies PortalToken,
      this.config.get<string>("JWT_SECRET") ?? "dev-secret",
      { expiresIn: "12h" }
    )

    return {
      token,
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        position: employee.position,
        branch: employee.branch
      }
    }
  }

  async me(authorization?: string) {
    const employee = await this.currentEmployee(authorization)
    return {
      id: employee.id,
      fullName: employee.fullName,
      position: employee.position,
      phone: employee.phone,
      branch: employee.branch
    }
  }

  async options(authorization?: string) {
    await this.currentEmployee(authorization)
    const config = await this.prisma.systemConfig.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" }
    })
    return {
      beveragePrice: Number(config.beveragePrice),
      requestKinds: ["SALARY_ADVANCE", "DRINK", "INTERNAL_CONSUMPTION"]
    }
  }

  async changeCode(currentCode: string, newCode: string, authorization?: string) {
    const employee = await this.currentEmployee(authorization)
    if (!/^\d{6}$/.test(currentCode) || !/^\d{6}$/.test(newCode)) {
      throw new BadRequestException("El código debe tener 6 dígitos")
    }

    const validCurrentCode = await bcrypt.compare(currentCode, employee.pinHash)
    if (!validCurrentCode) {
      throw new BadRequestException("Código actual incorrecto")
    }

    const updated = await this.prisma.employee.update({
      where: { id: employee.id },
      data: { pinHash: await bcrypt.hash(newCode, 12) },
      include: { branch: true }
    })
    await this.audit.log({
      action: AuditAction.UPDATE,
      entity: "Employee",
      entityId: employee.id,
      affectedEmployeeId: employee.id,
      newValue: this.toJson({ privateCodeChanged: true })
    })

    return {
      id: updated.id,
      fullName: updated.fullName,
      position: updated.position,
      phone: updated.phone,
      branch: updated.branch
    }
  }

  async balance(authorization?: string) {
    const employee = await this.currentEmployee(authorization)
    const grouped = await this.prisma.movement.groupBy({
      by: ["kind"],
      where: {
        employeeId: employee.id,
        status: { in: [MovementStatus.AUTHORIZED, MovementStatus.PARTIALLY_DISCOUNTED] }
      },
      _sum: { amount: true }
    })
    const discounted = await this.prisma.movement.aggregate({
      where: { employeeId: employee.id, status: MovementStatus.DISCOUNTED },
      _sum: { amount: true }
    })
    const pending = await this.prisma.movement.count({
      where: { employeeId: employee.id, status: MovementStatus.PENDING }
    })
    const authorized = grouped.reduce((total, row) => total + Number(row._sum.amount ?? 0), 0)

    return {
      employeeId: employee.id,
      pendingBalance: authorized,
      totalDiscounted: Number(discounted._sum.amount ?? 0),
      pendingRequests: pending,
      byKind: grouped.map((row) => ({ kind: row.kind, amount: Number(row._sum.amount ?? 0) }))
    }
  }

  async movements(authorization?: string) {
    const employee = await this.currentEmployee(authorization)
    return this.prisma.movement.findMany({
      where: { employeeId: employee.id },
      include: {
        registeredBy: { select: { id: true, fullName: true, role: true } },
        authorizedBy: { select: { id: true, fullName: true, role: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 150
    })
  }

  async movementDetail(id: string, authorization?: string) {
    const employee = await this.currentEmployee(authorization)
    const movement = await this.prisma.movement.findFirst({
      where: { id, employeeId: employee.id },
      include: {
        registeredBy: { select: { id: true, fullName: true, role: true } },
        authorizedBy: { select: { id: true, fullName: true, role: true } }
      }
    })
    if (!movement) throw new NotFoundException("Movimiento no encontrado")
    return movement
  }

  async createRequest(dto: CreateEmployeeRequestInput, authorization: string | undefined, metadata: RequestMetadata) {
    const employee = await this.currentEmployee(authorization)
    return this.movementsService.createEmployeeRequest(dto, employee, metadata)
  }

  private async currentEmployee(authorization?: string) {
    const payload = this.verifyToken(authorization)
    const employee = await this.prisma.employee.findUnique({
      where: { id: payload.sub },
      include: { branch: true }
    })
    if (!employee?.active) throw new ForbiddenException("Empleado inactivo")
    return employee
  }

  private verifyToken(authorization?: string) {
    if (!authorization?.startsWith("Bearer ")) throw new UnauthorizedException("Token de empleado requerido")
    try {
      const payload = jwt.verify(
        authorization.slice(7),
        this.config.get<string>("JWT_SECRET") ?? "dev-secret"
      ) as PortalToken
      if (payload.portal !== "employee") throw new UnauthorizedException("Token de empleado invalido")
      return payload
    } catch {
      throw new UnauthorizedException("Token de empleado invalido")
    }
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
  }
}
