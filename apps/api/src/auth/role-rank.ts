import { Role } from "@prisma/client"

const roleRank: Record<Role, number> = {
  [Role.EMPLEADO]: 10,
  [Role.CAJERO]: 20,
  [Role.ENCARGADO]: 30,
  [Role.GERENTE]: 40,
  [Role.ADMINISTRADOR]: 50
}

export function roleMeets(userRole: Role, requiredRole: Role) {
  return roleRank[userRole] >= roleRank[requiredRole]
}
