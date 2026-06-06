import assert from "node:assert/strict"
import { NotFoundException } from "@nestjs/common"
import { Role } from "@prisma/client"
import type { AuthUser } from "../auth/auth.types"
import { EmployeesService } from "./employees.service"

type CapturedArgs = {
  employeeFindMany?: { where?: unknown }
  employeeFindFirst?: { where?: unknown }
  movementGroupByCalled: boolean
  movementAggregateCalled: boolean
}

function createService(options: { employeeFound?: boolean } = {}) {
  const captured: CapturedArgs = {
    movementGroupByCalled: false,
    movementAggregateCalled: false
  }
  const employeeFound = options.employeeFound ?? true
  const prisma = {
    employee: {
      findMany: async (args: { where?: unknown }) => {
        captured.employeeFindMany = args
        return []
      },
      findFirst: async (args: { where?: unknown }) => {
        captured.employeeFindFirst = args
        return employeeFound ? { id: "employee-match" } : null
      }
    },
    movement: {
      groupBy: async () => {
        captured.movementGroupByCalled = true
        return []
      },
      aggregate: async () => {
        captured.movementAggregateCalled = true
        return { _sum: { amount: null } }
      }
    }
  }

  return {
    service: new EmployeesService(prisma as never, {} as never),
    captured
  }
}

function authUser(overrides: Partial<AuthUser>): AuthUser {
  return {
    sub: "user-1",
    email: "user@example.com",
    role: Role.ADMINISTRADOR,
    ...overrides
  }
}

function andClauses(where: unknown) {
  assert.equal(typeof where, "object")
  assert.ok(where)

  const clauses = (where as { AND?: unknown }).AND
  assert.ok(Array.isArray(clauses), "Se esperaba composicion AND para aislar scope y filtros")
  return clauses as Array<Record<string, unknown>>
}

async function employeeListCannotOverrideOwnScope() {
  const { service, captured } = createService()
  await service.list(
    { branchId: "branch-other", includeInactive: true },
    authUser({ role: Role.EMPLEADO, employeeId: "employee-own" })
  )

  const clauses = andClauses(captured.employeeFindMany?.where)
  assert.ok(clauses.some((clause) => clause.id === "employee-own"))
  assert.ok(clauses.some((clause) => clause.branchId === "branch-other"))
  assert.equal((captured.employeeFindMany?.where as Record<string, unknown>).id, undefined)
}

async function cashierListCannotOverrideBranchScope() {
  const { service, captured } = createService()
  await service.list(
    { branchId: "branch-other" },
    authUser({ role: Role.CAJERO, branchId: "branch-own" })
  )

  const clauses = andClauses(captured.employeeFindMany?.where)
  assert.ok(clauses.some((clause) => clause.branchId === "branch-own"))
  assert.ok(clauses.some((clause) => clause.branchId === "branch-other"))
  assert.equal((captured.employeeFindMany?.where as Record<string, unknown>).branchId, undefined)
}

async function managerInChargeGetCannotBypassBranchScope() {
  const { service, captured } = createService({ employeeFound: false })

  await assert.rejects(
    () => service.get("employee-other", authUser({ role: Role.ENCARGADO, branchId: "branch-own" })),
    NotFoundException
  )

  const clauses = andClauses(captured.employeeFindFirst?.where)
  assert.ok(clauses.some((clause) => clause.branchId === "branch-own"))
  assert.ok(clauses.some((clause) => clause.id === "employee-other"))
}

async function employeeBalanceCannotReadAnotherEmployee() {
  const { service, captured } = createService({ employeeFound: false })

  await assert.rejects(
    () => service.balance("employee-other", authUser({ role: Role.EMPLEADO, employeeId: "employee-own" })),
    NotFoundException
  )

  const clauses = andClauses(captured.employeeFindFirst?.where)
  assert.ok(clauses.some((clause) => clause.id === "employee-own"))
  assert.ok(clauses.some((clause) => clause.id === "employee-other"))
  assert.equal(captured.movementGroupByCalled, false)
  assert.equal(captured.movementAggregateCalled, false)
}

async function adminCanUseClientFilters() {
  const { service, captured } = createService()
  await service.list(
    { branchId: "branch-any", q: "ana", includeInactive: true },
    authUser({ role: Role.ADMINISTRADOR })
  )

  assert.deepEqual(captured.employeeFindMany?.where, {
    branchId: "branch-any",
    OR: [
      { fullName: { contains: "ana", mode: "insensitive" } },
      { position: { contains: "ana", mode: "insensitive" } },
      { phone: { contains: "ana", mode: "insensitive" } }
    ]
  })
}

async function run() {
  await employeeListCannotOverrideOwnScope()
  await cashierListCannotOverrideBranchScope()
  await managerInChargeGetCannotBypassBranchScope()
  await employeeBalanceCannotReadAnotherEmployee()
  await adminCanUseClientFilters()
  console.log("Employees scope tests passed")
}

void run()
