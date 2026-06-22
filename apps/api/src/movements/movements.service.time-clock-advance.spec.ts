import assert from "node:assert/strict"
import { MovementOrigin, MovementStatus } from "@prisma/client"
import { MovementsService } from "./movements.service"

async function registersAuthorizedAdvanceWithBranchManager() {
  let createdData: Record<string, unknown> | undefined
  let shiftCheck: Record<string, unknown> | undefined
  const prisma = {
    movement: {
      findFirst: async () => null,
      count: async () => 0,
      create: async (args: { data: Record<string, unknown> }) => {
        createdData = args.data
        return { id: "movement-1", ...args.data }
      }
    },
    systemConfig: {
      upsert: async () => ({ beveragePrice: 30, receiptLegalText: "Texto legal" })
    }
  }
  const audit = { log: async () => undefined }
  const timeClock = {
    authorizeSalaryAdvanceRequest: async () => ({
      device: { id: "device-1", branchId: "branch-1" },
      employee: { id: "employee-1", branchId: "branch-1", fullName: "Empleado" },
      approver: { id: "manager-1", fullName: "Encargado", branchId: "branch-1" }
    }),
    ensureEmployeeHasActiveShift: async (_employeeId: string, _kind: string, metadata: Record<string, unknown>) => {
      shiftCheck = metadata
    }
  }
  const service = new MovementsService(prisma as never, audit as never, timeClock as never)

  const movement = await service.createTimeClockSalaryAdvance(
    "device-token",
    { employeeCode: "123456", approverCode: "654321", amount: 350 },
    { ipAddress: "127.0.0.1", userAgent: "test" }
  )

  assert.equal(movement.id, "movement-1")
  assert.equal(createdData?.status, MovementStatus.AUTHORIZED)
  assert.equal(createdData?.origin, MovementOrigin.EMPLOYEE_REQUEST)
  assert.equal(createdData?.authorizedById, "manager-1")
  assert.equal(createdData?.amount, 350)
  assert.equal(createdData?.requestDevice, "time-clock:device-1")
  assert.equal(shiftCheck?.userId, "manager-1")
}

void registersAuthorizedAdvanceWithBranchManager().then(() => {
  console.log("Time-clock salary advance tests passed")
})
