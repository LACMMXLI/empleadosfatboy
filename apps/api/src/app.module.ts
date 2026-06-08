import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { APP_GUARD } from "@nestjs/core"
import { PrismaModule } from "./prisma/prisma.module"
import { AuthModule } from "./auth/auth.module"
import { EmployeesModule } from "./employees/employees.module"
import { MovementsModule } from "./movements/movements.module"
import { DashboardModule } from "./dashboard/dashboard.module"
import { ConfigurationModule } from "./configuration/configuration.module"
import { AuditModule } from "./audit/audit.module"
import { EmployeePortalModule } from "./employee-portal/employee-portal.module"
import { PayrollModule } from "./payroll/payroll.module"
import { AdminUsersModule } from "./admin-users/admin-users.module"
import { JwtAuthGuard } from "./auth/jwt-auth.guard"
import { RolesGuard } from "./auth/roles.guard"
import { HealthController } from "./health.controller"

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AuthModule,
    EmployeesModule,
    MovementsModule,
    EmployeePortalModule,
    DashboardModule,
    ConfigurationModule,
    PayrollModule,
    AdminUsersModule
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard }
  ],
  controllers: [HealthController]
})
export class AppModule {}
