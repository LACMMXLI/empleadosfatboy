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
  const service = new TimeClockService(prisma as never, audit as never, {} as never, {} as never, {} as never)

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
