import { Injectable } from "@nestjs/common"
import { MovementKind, MovementStatus, Prisma, Role } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import type { AuthUser } from "../auth/auth.types"

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user: AuthUser) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(start.getDate() + 1)

    const scope: Prisma.MovementWhereInput =
      user.role === Role.ADMINISTRADOR || user.role === Role.GERENTE
        ? {}
        : user.role === Role.EMPLEADO
          ? { employeeId: user.employeeId ?? "__none__" }
          : { branchId: user.branchId ?? undefined }

    const todayWhere = { ...scope, status: { not: MovementStatus.DISCOUNTED }, payrollLinks: { none: {} }, createdAt: { gte: start, lt: end } }
    const [todayByKind, pending, authorized, debt, weekly] = await Promise.all([
      this.prisma.movement.groupBy({
        by: ["kind"],
        where: todayWhere,
        _sum: { amount: true }
      }),
      this.prisma.movement.count({ where: { ...scope, status: MovementStatus.PENDING } }),
      this.prisma.movement.count({ where: { ...scope, status: MovementStatus.AUTHORIZED, payrollLinks: { none: {} } } }),
      this.prisma.movement.aggregate({
        where: {
          ...scope,
          status: { in: [MovementStatus.AUTHORIZED, MovementStatus.PARTIALLY_DISCOUNTED] },
          payrollLinks: { none: {} }
        },
        _sum: { amount: true }
      }),
      this.prisma.movement.findMany({
        where: {
          ...scope,
          kind: MovementKind.SALARY_ADVANCE,
          status: { not: MovementStatus.DISCOUNTED },
          payrollLinks: { none: {} },
          createdAt: { gte: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) }
        },
        select: { createdAt: true, amount: true, employee: { select: { fullName: true } } },
        orderBy: { createdAt: "asc" }
      })
    ])

    const kindTotal = (kind: MovementKind) =>
      Number(todayByKind.find((row) => row.kind === kind)?._sum.amount ?? 0)

    return {
      cards: {
        advancesToday: kindTotal(MovementKind.SALARY_ADVANCE),
        consumptionsToday:
          kindTotal(MovementKind.INTERNAL_CONSUMPTION) + kindTotal(MovementKind.DRINK) + kindTotal(MovementKind.FOOD),
        cashOutToday: kindTotal(MovementKind.CASH_OUT),
        pendingToDiscount: Number(debt._sum.amount ?? 0),
        pendingMovements: pending,
        authorizedMovements: authorized
      },
      weeklyAdvances: weekly.map((item) => ({
        date: item.createdAt.toISOString().slice(0, 10),
        amount: Number(item.amount),
        employee: item.employee.fullName
      }))
    }
  }
}
