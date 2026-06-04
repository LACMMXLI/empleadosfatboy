import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common"
import { AuditAction, Prisma, Role } from "@prisma/client"
import bcrypt from "bcryptjs"
import { AuditService } from "../audit/audit.service"
import { PrismaService } from "../prisma/prisma.service"

type CreateAdminUserInput = {
  fullName: string
  email: string
  password: string
  role: Role
}

type UpdateAdminUserInput = {
  fullName?: string
  email?: string
  password?: string
  role?: Role
  active?: boolean
}

const allowedRoles = new Set<Role>([Role.ADMINISTRADOR, Role.GERENTE, Role.ENCARGADO, Role.CAJERO])

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  list() {
    return this.prisma.user.findMany({
      where: { role: { in: Array.from(allowedRoles) } },
      select: this.safeSelect(),
      orderBy: [{ active: "desc" }, { fullName: "asc" }]
    })
  }

  async create(dto: CreateAdminUserInput, adminId: string, fallbackBranchId?: string, ipAddress?: string) {
    this.ensureAllowedRole(dto.role)
    const email = dto.email.trim().toLowerCase()
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) throw new ConflictException("Ya existe un usuario con ese correo")

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName.trim(),
        email,
        passwordHash: await bcrypt.hash(dto.password, 12),
        role: dto.role,
        branchId: fallbackBranchId
      },
      select: this.safeSelect()
    })

    await this.audit.log({
      userId: adminId,
      action: AuditAction.CREATE,
      entity: "User",
      entityId: user.id,
      newValue: this.toJson(user),
      ipAddress
    })

    return user
  }

  async update(id: string, dto: UpdateAdminUserInput, adminId: string, ipAddress?: string) {
    if (dto.role) this.ensureAllowedRole(dto.role)
    const before = await this.prisma.user.findUnique({ where: { id }, select: this.safeSelect() })
    if (!before) throw new NotFoundException("Usuario no encontrado")
    if (before.role === Role.EMPLEADO) throw new BadRequestException("Este endpoint solo administra usuarios administrativos")

    const email = dto.email?.trim().toLowerCase()
    if (email && email !== before.email) {
      const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } })
      if (existing) throw new ConflictException("Ya existe un usuario con ese correo")
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName?.trim(),
        email,
        role: dto.role,
        active: dto.active,
        passwordHash: dto.password ? await bcrypt.hash(dto.password, 12) : undefined
      },
      select: this.safeSelect()
    })

    await this.audit.log({
      userId: adminId,
      action: AuditAction.UPDATE,
      entity: "User",
      entityId: user.id,
      oldValue: this.toJson(before),
      newValue: this.toJson(user),
      ipAddress
    })

    return user
  }

  private ensureAllowedRole(role: Role) {
    if (!allowedRoles.has(role)) throw new BadRequestException("Rol administrativo no permitido")
  }

  private safeSelect() {
    return {
      id: true,
      fullName: true,
      email: true,
      role: true,
      active: true,
      branch: true,
      createdAt: true,
      updatedAt: true
    } satisfies Prisma.UserSelect
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
  }
}
