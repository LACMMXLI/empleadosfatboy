import { Injectable, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { AuditAction } from "@prisma/client"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { PrismaService } from "../prisma/prisma.service"
import { AuditService } from "../audit/audit.service"

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService
  ) {}

  async login(email: string, password: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { branch: true, employee: true }
    })
    if (!user?.active) throw new UnauthorizedException("Credenciales invalidas")

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) throw new UnauthorizedException("Credenciales invalidas")

    await this.audit.log({
      userId: user.id,
      action: AuditAction.LOGIN,
      entity: "User",
      entityId: user.id,
      ipAddress
    })

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        branchId: user.branchId,
        employeeId: user.employeeId
      },
      this.config.get<string>("JWT_SECRET") ?? "dev-secret",
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
