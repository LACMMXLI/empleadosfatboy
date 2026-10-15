import assert from "node:assert/strict"
import { ConflictException, BadRequestException } from "@nestjs/common"
import { MovementKind, MovementStatus, Role } from "@prisma/client"
import type { AuthUser } from "../auth/auth.types"
import { MovementsService } from "./movements.service"

const admin: AuthUser = { sub: "user-1", email: "a@x.com", role: Role.ADMINISTRADOR } as AuthUser

// Simulates a row in the database where updateMany only matches when the guard holds,
// which is how a concurrent request that lost the race would observe it.
function createService(initial: { status: MovementStatus; deliveredAt?: Date | null }) {
  const row = {
    id: "m1",
    employeeId: "e1",
    kind: MovementKind.SALARY_ADVANCE,
    amount: 100,
    status: initial.status,
    deliveredAt: initial.deliveredAt ?? null
  }
  const matches = (where: { status?: unknown; deliveredAt?: unknown }) =>
    (where.status === undefined || where.status === row.status) &&
    (where.deliveredAt === undefined || where.deliveredAt === row.deliveredAt)
  const prisma = {
    movement: {
      findFirst: async () => ({ ...row }),
      findUniqueOrThrow: async () => ({ ...row }),
      updateMany: async (args: { where: { status?: unknown; deliveredAt?: unknown }; data: Record<string, unknown> }) => {
        if (!matches(args.where)) return { count: 0 }
        Object.assign(row, args.data)
        return { count: 1 }
      }
    },
    authorizationRule: { findFirst: async () => ({ requiredRole: Role.ENCARGADO }) }
  }
  const service = new MovementsService(prisma as never, { log: async () => undefined } as never, {} as never)
  return { service, row, prisma }
}

async function authorizeOnlyOnce() {
  const { service, row } = createService({ status: MovementStatus.PENDING })
  await service.authorize("m1", admin)
  assert.equal(row.status, MovementStatus.AUTHORIZED)
  await assert.rejects(() => service.authorize("m1", admin), BadRequestException)
}

async function authorizeLosingRaceConflicts() {
  const { service, row, prisma } = createService({ status: MovementStatus.PENDING })
  // Another request authorizes between our read and our write.
  const originalFindFirst = prisma.movement.findFirst
  prisma.movement.findFirst = async () => {
    const snapshot = await originalFindFirst()
    row.status = MovementStatus.AUTHORIZED
    return snapshot
  }
  await assert.rejects(() => service.authorize("m1", admin), ConflictException)
}

async function deliverLosingRaceConflicts() {
  const { service, row, prisma } = createService({ status: MovementStatus.AUTHORIZED })
  const originalFindFirst = prisma.movement.findFirst
  prisma.movement.findFirst = async () => {
    const snapshot = await originalFindFirst()
    row.deliveredAt = new Date()
    return snapshot
  }
  await assert.rejects(() => service.deliver("m1", admin), ConflictException)
}

async function rejectLosingRaceConflicts() {
  const { service, row, prisma } = createService({ status: MovementStatus.PENDING })
  const originalFindFirst = prisma.movement.findFirst
  prisma.movement.findFirst = async () => {
    const snapshot = await originalFindFirst()
    row.status = MovementStatus.AUTHORIZED
    return snapshot
  }
  await assert.rejects(() => service.reject("m1", admin), ConflictException)
}

async function invalidDateIsBadRequest() {
  const { service } = createService({ status: MovementStatus.PENDING })
  await assert.rejects(
    () => service.list({ from: "no-es-fecha" } as never, admin),
    BadRequestException
  )
}

async function main() {
  await authorizeOnlyOnce()
  await authorizeLosingRaceConflicts()
  await deliverLosingRaceConflicts()
  await rejectLosingRaceConflicts()
  await invalidDateIsBadRequest()
  console.log("Movements transition tests passed")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
