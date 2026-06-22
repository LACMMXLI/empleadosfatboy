import assert from "node:assert/strict"
import { NotFoundException } from "@nestjs/common"
import { MovementKind, MovementStatus, Role } from "@prisma/client"
import bcrypt from "bcryptjs"
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

function createWriteService() {
  const captured: {
    employeeFindFirst?: { where?: unknown }
    movementFindFirst?: { where?: unknown }
    movementCreate?: { data?: Record<string, unknown> }
  } = {}
  const prisma = {
    employee: {
      findFirst: async (args: { where?: unknown }) => {
        captured.employeeFindFirst = args
        const where = args.where as { branchId?: string; id?: string; active?: boolean }
        if (where.branchId === "branch-own" && where.id === "employee-other") return null
        return {
          id: where.id ?? "employee-any",
          branchId: "branch-other",
          active: true,
          pinHash: bcrypt.hashSync("123456", 4),
          branch: { id: "branch-other", active: true }
        }
      }
    },
    movement: {
      count: async () => 0,
      create: async (args: { data?: Record<string, unknown> }) => {
        captured.movementCreate = args
        return { id: "movement-created", ...args.data }
      },
      findFirst: async (args: { where?: unknown }) => {
        captured.movementFindFirst = args
        const where = args.where as { AND?: Array<Record<string, unknown>> }
        const clauses = Array.isArray(where.AND) ? where.AND : [where as Record<string, unknown>]
        if (clauses.some((clause) => clause.branchId === "branch-own")) return null
        return {
          id: "movement-any",
          employeeId: "employee-other",
          branchId: "branch-other",
          kind: MovementKind.SALARY_ADVANCE,
          amount: 100,
          status: MovementStatus.PENDING
        }
      },
      update: async (args: { data?: Record<string, unknown> }) => ({ id: "movement-any", ...args.data })
    },
    systemConfig: {
      upsert: async () => ({
        beveragePrice: 30,
        receiptLegalText: "recibo"
      })
    },
    authorizationRule: {
      findFirst: async () => ({ requiredRole: Role.ENCARGADO })
    }
  }
  const audit = {
    log: async () => undefined
  }
  const timeClock = {
    ensureEmployeeHasActiveShift: async () => undefined
  }

  return {
    service: new MovementsService(prisma as never, audit as never, timeClock as never),
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

async function cashierCannotCreateMovementForAnotherBranch() {
  const { service, captured } = createWriteService()

  await assert.rejects(
    () =>
      service.create(
        {
          employeeId: "employee-other",
          kind: MovementKind.SALARY_ADVANCE,
          amount: 100,
          reason: "Adelanto",
          employeePin: "123456"
        },
        user({ role: Role.CAJERO, branchId: "branch-own" })
      ),
    NotFoundException
  )

  assert.deepEqual(captured.employeeFindFirst?.where, {
    id: "employee-other",
    active: true,
    branchId: "branch-own"
  })
  assert.equal(captured.movementCreate, undefined)
}

async function managerInChargeCannotAuthorizeMovementForAnotherBranch() {
  const { service, captured } = createWriteService()

  await assert.rejects(
    () => service.authorize("movement-other", user({ role: Role.ENCARGADO, branchId: "branch-own" })),
    NotFoundException
  )

  const clauses = andClauses(captured.movementFindFirst?.where)
  assert.ok(clauses.some((clause) => clause.branchId === "branch-own"))
  assert.ok(clauses.some((clause) => clause.id === "movement-other"))
}

async function managerCanAuthorizeMovementAccordingToRole() {
  const { service, captured } = createWriteService()

  const updated = await service.authorize("movement-other", user({ role: Role.GERENTE }))

  assert.equal(updated.id, "movement-any")
  assert.deepEqual(captured.movementFindFirst?.where, { id: "movement-other" })
}

async function adminCanCreateMovementAccordingToRole() {
  const { service, captured } = createWriteService()

  const movement = await service.create(
    {
      employeeId: "employee-other",
      kind: MovementKind.SALARY_ADVANCE,
      amount: 100,
      reason: "Adelanto",
      employeePin: "123456"
    },
    user({ role: Role.ADMINISTRADOR })
  )

  assert.equal(movement.id, "movement-created")
  assert.deepEqual(captured.employeeFindFirst?.where, {
    id: "employee-other",
    active: true
  })
  assert.equal(captured.movementCreate?.data?.registeredById, "user-1")
}

async function run() {
  await employeeCannotOverrideEmployeeScope()
  await cashierCannotOverrideBranchScope()
  await managerInChargeCannotOverrideBranchScope()
  await adminCanUseClientFilters()
  await cashierCannotCreateMovementForAnotherBranch()
  await managerInChargeCannotAuthorizeMovementForAnotherBranch()
  await managerCanAuthorizeMovementAccordingToRole()
  await adminCanCreateMovementAccordingToRole()
  console.log("Movements scope tests passed")
}

void run()
