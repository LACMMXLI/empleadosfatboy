import assert from "node:assert/strict"
import { MovementKind, MovementStatus, PayrollStatus, Role, SalaryType } from "@prisma/client"
import { PayrollService } from "./payroll.service"

type Captured = {
  payrollCreateData?: Record<string, unknown>
  movementUpdateMany?: { where?: unknown; data?: unknown }
  payrollUpdate?: { where?: unknown; data?: Record<string, unknown> }
  payrollItemMovementDeleteMany?: { where?: unknown }
}

const periodStart = new Date("2026-06-01T00:00:00")
const periodEnd = new Date("2026-06-07T00:00:00")

function payrollRecord(status: PayrollStatus = PayrollStatus.GENERADA, withMovementLinks = true) {
  return {
    id: "payroll-1",
    periodStart,
    periodEnd,
    periodKey: "2026-06-01_2026-06-07",
    status,
    totalGross: 1000,
    totalDeductions: 100,
    totalAdjustments: 0,
    totalNet: 900,
    generatedByAdminId: "admin-1",
    generatedAt: new Date("2026-06-08T10:00:00"),
    paidAt: status === PayrollStatus.PAGADA ? new Date("2026-06-08T11:00:00") : null,
    cancelledAt: status === PayrollStatus.CANCELADA ? new Date("2026-06-08T11:00:00") : null,
    cancelReason: status === PayrollStatus.CANCELADA ? "error" : null,
    generatedByAdmin: { id: "admin-1", fullName: "Admin", role: Role.ADMINISTRADOR },
    items: [
      {
        id: "payroll-item-1",
        employeeId: "employee-1",
        employee: {
          id: "employee-1",
          fullName: "Ana Lopez",
          position: "Mesera"
        },
        baseSalary: 1000,
        totalAdvances: 100,
        totalInternalConsumption: 0,
        totalAdminCharges: 0,
        totalPenalties: 0,
        totalPositiveAdjustments: 0,
        totalNegativeAdjustments: 0,
        totalDeductions: 100,
        netPay: 900,
        movements: withMovementLinks
          ? [
              {
                movementId: "movement-1",
                movement: {
                  id: "movement-1",
                  folio: "MOV-1",
                  kind: MovementKind.SALARY_ADVANCE,
                  amount: 100,
                  reason: "Adelanto",
                  createdAt: new Date("2026-06-02T10:00:00")
                }
              }
            ]
          : []
      }
    ]
  }
}

function createService() {
  const captured: Captured = {}
  const tx = {
    payroll: {
      create: async (args: { data?: Record<string, unknown> }) => {
        captured.payrollCreateData = args.data
        return payrollRecord()
      },
      update: async (args: { where?: unknown; data?: Record<string, unknown> }) => {
        captured.payrollUpdate = args
        const status = args.data?.status as PayrollStatus | undefined
        return payrollRecord(status ?? PayrollStatus.GENERADA, status !== PayrollStatus.CANCELADA)
      }
    },
    movement: {
      updateMany: async (args: { where?: unknown; data?: unknown }) => {
        captured.movementUpdateMany = args
        return { count: 1 }
      }
    },
    payrollItemMovement: {
      deleteMany: async (args: { where?: unknown }) => {
        captured.payrollItemMovementDeleteMany = args
        return { count: 1 }
      }
    },
    auditLog: {
      create: async () => ({ id: "audit-1" })
    }
  }

  const prisma = {
    payroll: {
      findUnique: async (args: { select?: unknown; include?: unknown }) => {
        if (args.select) return null
        return payrollRecord()
      }
    },
    employee: {
      findMany: async () => [
        {
          id: "employee-1",
          fullName: "Ana Lopez",
          position: "Mesera",
          salaryAmount: 1000,
          salaryType: SalaryType.WEEKLY,
          movements: [
            {
              id: "movement-1",
              folio: "MOV-1",
              kind: MovementKind.SALARY_ADVANCE,
              amount: 100,
              reason: "Adelanto",
              createdAt: new Date("2026-06-02T10:00:00")
            }
          ]
        }
      ]
    },
    $transaction: async (callback: (transactionClient: typeof tx) => unknown) => callback(tx)
  }

  return {
    service: new PayrollService(prisma as never, {} as never),
    captured
  }
}

async function generateCreatesPayrollMovementLinks() {
  const { service, captured } = createService()

  await service.generate({ periodStart: "2026-06-01", periodEnd: "2026-06-07" }, "admin-1")

  const items = (captured.payrollCreateData?.items as { create?: Array<{ movements?: { create?: unknown[] } }> }).create
  assert.ok(Array.isArray(items))
  assert.deepEqual(items[0].movements?.create, [{ movementId: "movement-1" }])
}

async function markPaidDiscountsLinkedMovements() {
  const { service, captured } = createService()

  await service.markPaid("payroll-1", "admin-1")

  assert.deepEqual(captured.movementUpdateMany, {
    where: {
      id: { in: ["movement-1"] },
      status: { in: [MovementStatus.AUTHORIZED, MovementStatus.PARTIALLY_DISCOUNTED] }
    },
    data: { status: MovementStatus.DISCOUNTED }
  })
  assert.equal(captured.payrollUpdate?.data?.status, PayrollStatus.PAGADA)
}

async function cancelReleasesMovementLinksAndPeriodKey() {
  const { service, captured } = createService()

  await service.cancel("payroll-1", "Periodo incorrecto", "admin-1")

  assert.deepEqual(captured.payrollItemMovementDeleteMany, {
    where: { payrollItem: { payrollId: "payroll-1" } }
  })
  assert.equal(captured.payrollUpdate?.data?.status, PayrollStatus.CANCELADA)
  assert.equal(captured.payrollUpdate?.data?.cancelReason, "Periodo incorrecto")
  assert.equal(captured.payrollUpdate?.data?.periodKey, "2026-06-01_2026-06-07__CANCELADA__payroll-1")
}

async function run() {
  await generateCreatesPayrollMovementLinks()
  await markPaidDiscountsLinkedMovements()
  await cancelReleasesMovementLinksAndPeriodKey()
  console.log("Payroll accounting tests passed")
}

void run()
