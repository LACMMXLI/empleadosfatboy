import { Module } from "@nestjs/common"
import { MovementsModule } from "../movements/movements.module"
import { SecurityModule } from "../security/security.module"
import { EmployeePortalController } from "./employee-portal.controller"
import { EmployeePortalService } from "./employee-portal.service"

@Module({
  imports: [MovementsModule, SecurityModule],
  controllers: [EmployeePortalController],
  providers: [EmployeePortalService]
})
export class EmployeePortalModule {}
