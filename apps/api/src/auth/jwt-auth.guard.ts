import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { ConfigService } from "@nestjs/config"
import jwt from "jsonwebtoken"
import { IS_PUBLIC_KEY } from "./public.decorator"
import { PrismaService } from "../prisma/prisma.service"
import type { AuthUser } from "./auth.types"
import { requiredJwtSecret } from "./jwt-secret"

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: AuthUser }>()
    const header = request.headers.authorization
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("Token requerido")

    try {
      const payload = jwt.verify(header.slice(7), requiredJwtSecret(this.config)) as AuthUser
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true, branchId: true, employeeId: true, active: true }
      })
      if (!user?.active) throw new UnauthorizedException("Usuario inactivo")
      request.user = {
        sub: user.id,
        email: user.email,
        role: user.role,
        branchId: user.branchId,
        employeeId: user.employeeId
      }
      return true
    } catch {
      throw new UnauthorizedException("Token invalido")
    }
  }
}
