import assert from "node:assert/strict"
import { MovementKind, WorkSessionStatus } from "@prisma/client"
import { TimeClockService } from "./time-clock.service"

async function acceptsActiveShiftFromPreviousLocalDate() {
  let capturedWhere: Record<string, unknown> | undefined
  let auditCalls = 0
  const prisma = {
    workSession: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        capturedWhere = args.where
        return {
          id: "overnight-session",
          localDate: "2026-06-21",
          startedAt: new Date("2026-06-22T00:00:00.000Z")
        }
      }
    }
  }
  const audit = { log: async () => { auditCalls += 1 } }
  const config = { get: (key: string) => (key === "REQUIRE_ACTIVE_SHIFT_FOR_MOVEMENTS" ? "true" : undefined) }
  const service = new TimeClockService(prisma as never, audit as never, {} as never, {} as never, config as never)

  await service.ensureEmployeeHasActiveShift("employee-1", MovementKind.DRINK, { context: "overnight-test" })

  assert.deepEqual(capturedWhere, {
    employeeId: "employee-1",
    status: WorkSessionStatus.ACTIVE
  })
  assert.equal(auditCalls, 0)
}

void acceptsActiveShiftFromPreviousLocalDate().then(() => {
  console.log("Overnight active shift test passed")
})

function createPostShiftService(options: { window?: string; closedEndedAt?: Date | null }) {
  const calls: Array<Record<string, unknown>> = []
  let auditCalls = 0
  const prisma = {
    workSession: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        calls.push(args.where)
        if (args.where.status === WorkSessionStatus.ACTIVE) return null
        const endedAt = options.closedEndedAt
        const range = args.where.endedAt as { gte: Date; lte: Date }
        return endedAt && endedAt >= range.gte && endedAt <= range.lte ? { id: "closed", endedAt } : null
      }
    }
  }
  const config = {
    get: (key: string) =>
      key === "REQUIRE_ACTIVE_SHIFT_FOR_MOVEMENTS" ? "true" : key === "POST_SHIFT_MOVEMENT_WINDOW_MINUTES" ? options.window : undefined
  }
  const service = new TimeClockService(prisma as never, { log: async () => { auditCalls += 1 } } as never, {} as never, {} as never, config as never)
  return { service, calls, audits: () => auditCalls }
}

async function allowsMovementsRightAfterClosingShift() {
  const { service, audits } = createPostShiftService({ closedEndedAt: new Date(Date.now() - 30 * 60_000) })
  await service.ensureEmployeeHasActiveShift("employee-1", MovementKind.DRINK, {})
  await service.ensureEmployeeHasActiveShift("employee-1", MovementKind.SALARY_ADVANCE, {})
  assert.equal(audits(), 0)
}

async function blocksMovementsAfterPostShiftWindowExpires() {
  const { service, audits } = createPostShiftService({ closedEndedAt: new Date(Date.now() - 5 * 60 * 60_000) })
  await assert.rejects(() => service.ensureEmployeeHasActiveShift("employee-1", MovementKind.DRINK, {}), /turno/)
  assert.equal(audits(), 1)
}

async function windowIsConfigurableAndCanBeDisabled() {
  const wide = createPostShiftService({ window: "600", closedEndedAt: new Date(Date.now() - 5 * 60 * 60_000) })
  await wide.service.ensureEmployeeHasActiveShift("employee-1", MovementKind.DRINK, {})
  const off = createPostShiftService({ window: "0", closedEndedAt: new Date(Date.now() - 60_000) })
  await assert.rejects(() => off.service.ensureEmployeeHasActiveShift("employee-1", MovementKind.DRINK, {}))
}

async function neverShiftEmployeeIsStillBlocked() {
  const { service } = createPostShiftService({ closedEndedAt: null })
  await assert.rejects(() => service.ensureEmployeeHasActiveShift("employee-1", MovementKind.DRINK, {}))
}

async function movementsDoNotNeedShiftByDefault() {
  let queried = false
  const prisma = { workSession: { findFirst: async () => { queried = true; return null } } }
  const service = new TimeClockService(prisma as never, { log: async () => undefined } as never, {} as never, {} as never, { get: () => undefined } as never)
  await service.ensureEmployeeHasActiveShift("employee-1", MovementKind.DRINK, {})
  await service.ensureEmployeeHasActiveShift("employee-1", MovementKind.SALARY_ADVANCE, {})
  assert.equal(queried, false)
}

void (async () => {
  await movementsDoNotNeedShiftByDefault()
  await allowsMovementsRightAfterClosingShift()
  await blocksMovementsAfterPostShiftWindowExpires()
  await windowIsConfigurableAndCanBeDisabled()
  await neverShiftEmployeeIsStillBlocked()
  console.log("Post-shift movement window tests passed")
})()
