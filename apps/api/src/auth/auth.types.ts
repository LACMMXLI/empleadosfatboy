import { Role } from "@prisma/client"
import type { Request } from "express"

export type AuthUser = {
  sub: string
  email: string
  role: Role
  branchId?: string | null
  employeeId?: string | null
}

export type RequestWithUser = Request & {
  user: AuthUser
  ip?: string
}
