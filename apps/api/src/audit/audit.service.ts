import { Injectable } from "@nestjs/common"
import { AuditAction, Prisma } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"

type AuditPayload = {
  userId?: string
  action: AuditAction
  entity: string
  entityId?: string
  affectedEmployeeId?: string
  oldValue?: Prisma.InputJsonValue
  newValue?: Prisma.InputJsonValue
  ipAddress?: string
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(payload: AuditPayload) {
    await this.prisma.auditLog.create({
      data: {
        userId: payload.userId,
        action: payload.action,
        entity: payload.entity,
        entityId: payload.entityId,
        affectedEmployeeId: payload.affectedEmployeeId,
        oldValue: payload.oldValue,
        newValue: payload.newValue,
        ipAddress: payload.ipAddress
      }
    })
  }
}
