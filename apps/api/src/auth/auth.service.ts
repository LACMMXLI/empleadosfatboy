import { Injectable, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { AuditAction } from "@prisma/client"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { PrismaService } from "../prisma/prisma.service"
import { AuditService } from "../audit/audit.service"
import { LoginThrottleService } from "../security/login-throttle.service"
import { requiredJwtSecret } from "./jwt-secret"

type LoginMetadata = {
  ipAddress?: string
  userAgent?: string
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly loginThrottle: LoginThrottleService
  ) {}

  async login(email: string, password: string, metadata: LoginMetadata = {}) {
    const loginEmail = email.trim()

    await this.loginThrottle.assertCanAttempt("admin", loginEmail)

    const user = await this.prisma.user.findUnique({
      where: { email: loginEmail },
      include: { branch: true, employee: true }
    })
    if (!user?.active) {
      await this.loginThrottle.recordFailure("admin", loginEmail, metadata)
      throw new UnauthorizedException("Credenciales invalidas")
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      await this.loginThrottle.recordFailure("admin", loginEmail, metadata)
      throw new UnauthorizedException("Credenciales invalidas")
    }

    await this.loginThrottle.recordSuccess("admin", loginEmail)

    await this.audit.log({
      userId: user.id,
      action: AuditAction.LOGIN,
      entity: "User",
      entityId: user.id,
      ipAddress: metadata.ipAddress
    })

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        branchId: user.branchId,
        employeeId: user.employeeId
      },
      requiredJwtSecret(this.config),
      { expiresIn: "12h" }
    )

    return {
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        branch: user.branch,
        employee: user.employee
      }
    }
  }

  async me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        branch: true,
        employee: true
      }
    })
  }
}
