import assert from "node:assert/strict"
import { TimeClockEventType } from "@prisma/client"
import { TimeClockService } from "./time-clock.service"

type MealEntry = {
  type: TimeClockEventType
  occurredAt: Date
  localDate: string
  localTime: string
}

function createService(entries: MealEntry[]) {
  const prisma = {
    workSession: {
      findFirst: async () => ({ id: "session-1", startedAt: new Date("2026-06-22T00:00:00.000Z") })
    },
    timeClockEntry: {
      findMany: async () => entries
    }
  }
  return new TimeClockService(prisma as never, {} as never, {} as never, {} as never, {} as never)
}

function entry(type: TimeClockEventType, minute: number): MealEntry {
  return {
    type,
    occurredAt: new Date(`2026-06-22T0${minute}:00:00.000Z`),
    localDate: "2026-06-21",
    localTime: `0${minute}:00:00`
  }
}

async function validatesShiftSequence() {
  const noMealService = createService([])
  const noMealRule = await (noMealService as unknown as {
    assertEntryAllowed: (employeeId: string, type: TimeClockEventType) => Promise<{ requiresManagerApproval: boolean }>
  }).assertEntryAllowed("employee-1", TimeClockEventType.EXIT)
  assert.equal(noMealRule.requiresManagerApproval, false)

  const onBreakService = createService([entry(TimeClockEventType.BREAK_START, 1)])
  await assert.rejects(
    () => (onBreakService as unknown as {
      assertEntryAllowed: (employeeId: string, type: TimeClockEventType) => Promise<unknown>
    }).assertEntryAllowed("employee-1", TimeClockEventType.EXIT),
    /Registra la entrada de comida/
  )

  const completedService = createService([
    entry(TimeClockEventType.BREAK_START, 1),
    entry(TimeClockEventType.BREAK_END, 2)
  ])
  const completedRule = await (completedService as unknown as {
    assertEntryAllowed: (employeeId: string, type: TimeClockEventType) => Promise<{ requiresManagerApproval: boolean }>
  }).assertEntryAllowed("employee-1", TimeClockEventType.EXIT)
  assert.equal(completedRule.requiresManagerApproval, false)

  await assert.rejects(
    () => (completedService as unknown as {
      assertEntryAllowed: (employeeId: string, type: TimeClockEventType) => Promise<unknown>
    }).assertEntryAllowed("employee-1", TimeClockEventType.BREAK_START),
    /ya fue completado/
  )
}

void validatesShiftSequence().then(() => {
  console.log("Time-clock sequence tests passed")
})
