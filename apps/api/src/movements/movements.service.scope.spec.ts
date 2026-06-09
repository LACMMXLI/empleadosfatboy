import assert from "node:assert/strict"
import { MovementStatus, Role } from "@prisma/client"
import type { AuthUser } from "../auth/auth.types"
import { MovementsService } from "./movements.service"

type CapturedFindMany = {
  where?: unknown
}

function createService() {
  const captured: CapturedFindMany = {}
  const prisma = {
    movement: {
      findMany: async (args: CapturedFindMany) => {
        captured.where = args.where
        return []
      }
    }
  }

  return {
    service: new MovementsService(prisma as never, {} as never, {} as never),
    captured
  }
}

function andClauses(where: unknown) {
  assert.equal(typeof where, "object")
  assert.ok(where)

  const clauses = (where as { AND?: unknown }).AND
  assert.ok(Array.isArray(clauses), "Se esperaba composicion AND para aislar scope y filtros")
  return clauses as Array<Record<string, unknown>>
}

function user(overrides: Partial<AuthUser>): AuthUser {
  return {
    sub: "user-1",
    email: "user@example.com",
    role: Role.ADMINISTRADOR,
    ...overrides
  }
}

async function capturesWhere(filters: Record<string, unknown>, authUser: AuthUser) {
  const { service, captured } = createService()
  await service.list(filters as never, authUser)
  return captured.where
}

async function employeeCannotOverrideEmployeeScope() {
  const where = await capturesWhere(
    { employeeId: "employee-other", status: MovementStatus.AUTHORIZED },
    user({ role: Role.EMPLEADO, employeeId: "employee-own", branchId: "branch-a" })
  )

  const clauses = andClauses(where)
  assert.ok(clauses.some((clause) => clause.employeeId === "employee-own"))
  assert.ok(clauses.some((clause) => clause.employeeId === "employee-other"))
  assert.equal((where as Record<string, unknown>).employeeId, undefined)
}

async function cashierCannotOverrideBranchScope() {
  const where = await capturesWhere(
    { branchId: "branch-other" },
    user({ role: Role.CAJERO, branchId: "branch-own" })
  )

  const clauses = andClauses(where)
  assert.ok(clauses.some((clause) => clause.branchId === "branch-own"))
  assert.ok(clauses.some((clause) => clause.branchId === "branch-other"))
  assert.equal((where as Record<string, unknown>).branchId, undefined)
}

async function managerInChargeCannotOverrideBranchScope() {
  const where = await capturesWhere(
    { branchId: "branch-other" },
    user({ role: Role.ENCARGADO, branchId: "branch-own" })
  )

  const clauses = andClauses(where)
  assert.ok(clauses.some((clause) => clause.branchId === "branch-own"))
  assert.ok(clauses.some((clause) => clause.branchId === "branch-other"))
  assert.equal((where as Record<string, unknown>).branchId, undefined)
}

async function adminCanUseClientFilters() {
  const where = await capturesWhere(
    { branchId: "branch-any", employeeId: "employee-any", status: MovementStatus.DISCOUNTED },
    user({ role: Role.ADMINISTRADOR })
  )

  assert.deepEqual(where, {
    employeeId: "employee-any",
    branchId: "branch-any",
    status: MovementStatus.DISCOUNTED
  })
}

async function run() {
  await employeeCannotOverrideEmployeeScope()
  await cashierCannotOverrideBranchScope()
  await managerInChargeCannotOverrideBranchScope()
  await adminCanUseClientFilters()
  console.log("Movements scope tests passed")
}

void run()
