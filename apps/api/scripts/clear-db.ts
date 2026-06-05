import { PrismaClient, Role } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("=== INICIANDO LIMPIEZA DE BASE DE DATOS ===")

  // 1. Desvincular referencias de empleados de todos los usuarios
  await prisma.user.updateMany({
    data: { employeeId: null }
  })
  console.log("✓ Desvinculadas referencias de empleados de los usuarios")

  // 2. Eliminar bitácoras de auditoría (AuditLog)
  const auditLogs = await prisma.auditLog.deleteMany()
  console.log(`✓ Eliminados ${auditLogs.count} registros de auditoría (AuditLog)`)

  // 3. Eliminar enlaces entre nóminas y movimientos (PayrollItemMovement)
  const payrollItemMovements = await prisma.payrollItemMovement.deleteMany()
  console.log(`✓ Eliminados ${payrollItemMovements.count} enlaces de movimientos de nómina (PayrollItemMovement)`)

  // 4. Eliminar detalles de nómina (PayrollItem)
  const payrollItems = await prisma.payrollItem.deleteMany()
  console.log(`✓ Eliminados ${payrollItems.count} detalles de nóminas (PayrollItem)`)

  // 5. Eliminar cabeceras de nóminas (Payroll)
  const payrolls = await prisma.payroll.deleteMany()
  console.log(`✓ Eliminados ${payrolls.count} registros de nóminas (Payroll)`)

  // 6. Eliminar movimientos registrados (Movement)
  const movements = await prisma.movement.deleteMany()
  console.log(`✓ Eliminados ${movements.count} movimientos registrados (Movement)`)

  // 7. Eliminar todos los usuarios que no sean administradores
  const nonAdminUsers = await prisma.user.deleteMany({
    where: {
      role: {
        not: Role.ADMINISTRADOR
      }
    }
  })
  console.log(`✓ Eliminados ${nonAdminUsers.count} usuarios no administradores (User)`)

  // 8. Eliminar todos los empleados registrados
  const employees = await prisma.employee.deleteMany()
  console.log(`✓ Eliminados ${employees.count} empleados registrados (Employee)`)

  // Mostrar resumen de lo que quedó activo en la base de datos
  const adminCount = await prisma.user.count({ where: { role: Role.ADMINISTRADOR } })
  const branchCount = await prisma.branch.count()
  const configCount = await prisma.systemConfig.count()
  const ruleCount = await prisma.authorizationRule.count()

  console.log("\n=== RESUMEN DE DATOS CONSERVADOS ===")
  console.log(`- Usuarios Administradores activos: ${adminCount}`)
  console.log(`- Sucursales activas: ${branchCount}`)
  console.log(`- Configuraciones del sistema: ${configCount}`)
  console.log(`- Reglas de autorización activas: ${ruleCount}`)
  console.log("===========================================")
  console.log("¡Limpieza de base de datos finalizada con éxito!")
}

main()
  .catch((error) => {
    console.error("❌ Error durante la limpieza de la base de datos:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
