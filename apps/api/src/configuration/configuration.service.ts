import { Injectable } from "@nestjs/common"
import { AuditAction, MovementKind, Prisma, Role } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { AuditService } from "../audit/audit.service"

type ConfigDto = {
  businessName?: string
  beveragePrice?: number
  receiptLegalText?: string
}

type RuleDto = {
  kind?: MovementKind
  minAmount: number
  maxAmount?: number
  requiredRole: Role
}

@Injectable()
export class ConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  get() {
    return this.prisma.systemConfig.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" }
    })
  }

  rules() {
    return this.prisma.authorizationRule.findMany({
      where: { active: true },
      orderBy: [{ kind: "asc" }, { minAmount: "asc" }]
    })
  }

  async update(dto: ConfigDto, userId: string, ipAddress?: string) {
    const before = await this.get()
    const updated = await this.prisma.systemConfig.update({
      where: { id: "default" },
      data: dto
    })
    await this.audit.log({
      userId,
      action: AuditAction.UPDATE,
      entity: "SystemConfig",
      entityId: "default",
      oldValue: this.toJson(before),
      newValue: this.toJson(updated),
      ipAddress
    })
    return updated
  }

  async createRule(dto: RuleDto, userId: string, ipAddress?: string) {
    const rule = await this.prisma.authorizationRule.create({
      data: {
        kind: dto.kind,
        minAmount: dto.minAmount,
        maxAmount: dto.maxAmount,
        requiredRole: dto.requiredRole
      }
    })
    await this.audit.log({
      userId,
      action: AuditAction.LIMIT_CHANGE,
      entity: "AuthorizationRule",
      entityId: rule.id,
      newValue: this.toJson(rule),
      ipAddress
    })
    return rule
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
  }
}
