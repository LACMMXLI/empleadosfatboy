import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { Role } from "@prisma/client"
import { ROLES_KEY } from "./roles.decorator"
import { roleMeets } from "./role-rank"
import type { AuthUser } from "./auth.types"

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ])
    if (!required?.length) return true

    const request = context.switchToHttp().getRequest<{ user: AuthUser }>()
    const allowed = required.some((role) => roleMeets(request.user.role, role))
    if (!allowed) throw new ForbiddenException("Permisos insuficientes")
    return true
  }
}
