import { PrismaClient, Role, MovementKind } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const branch = await prisma.branch.upsert({
    where: { code: "MATRIZ" },
    update: {},
    create: { code: "MATRIZ", name: "Sucursal Matriz" }
  })

  const branchVenecia = await prisma.branch.upsert({
    where: { code: "VENECIA" },
    update: {
      latitude: 32.59556653476791,
      longitude: -115.47062926924932,
      geofenceRadiusMeters: 100
    },
    create: {
      code: "VENECIA",
      name: "Sucursal Venecia",
      latitude: 32.59556653476791,
      longitude: -115.47062926924932,
      geofenceRadiusMeters: 100
    }
  })

  const branchSanMarcos = await prisma.branch.upsert({
    where: { code: "SAN_MARCOS" },
    update: {},
    create: { code: "SAN_MARCOS", name: "Sucursal San Marcos" }
  })

  const adminPassword = await bcrypt.hash("Admin123!", 12)
  await prisma.user.upsert({
    where: { email: "admin@fatboy.local" },
    update: {},
    create: {
      fullName: "Administrador Fatboy",
      email: "admin@fatboy.local",
      passwordHash: adminPassword,
      role: Role.ADMINISTRADOR,
      branchId: branch.id
    }
  })

  const employeePin = await bcrypt.hash("123456", 12)
  await prisma.employee.upsert({
    where: { phone: "0000000000" },
    update: {
      phone: "0000000000",
      pinHash: employeePin
    },
    create: {
      fullName: "Empleado Demo",
      pinHash: employeePin,
      position: "Cocina",
      phone: "0000000000",
      branchId: branch.id
    }
  })

  await prisma.systemConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" }
  })

  const rules = [
    { minAmount: 0, maxAmount: 100, requiredRole: Role.ENCARGADO },
    { minAmount: 100.01, maxAmount: 300, requiredRole: Role.GERENTE },
    { minAmount: 300.01, maxAmount: null, requiredRole: Role.ADMINISTRADOR }
  ]

  for (const rule of rules) {
    const existing = await prisma.authorizationRule.findFirst({
      where: {
        kind: null,
        minAmount: rule.minAmount,
        maxAmount: rule.maxAmount,
        requiredRole: rule.requiredRole
      }
    })

    if (!existing) {
      await prisma.authorizationRule.create({ data: rule })
    }
  }

  for (const kind of Object.values(MovementKind)) {
    const existing = await prisma.authorizationRule.findFirst({
      where: { kind, active: true }
    })
    if (!existing && kind === MovementKind.ADMIN_ADJUSTMENT) {
      await prisma.authorizationRule.create({
        data: { kind, minAmount: 0, maxAmount: null, requiredRole: Role.ADMINISTRADOR }
      })
    }
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
