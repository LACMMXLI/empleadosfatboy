import { Module } from "@nestjs/common"
import { AuditModule } from "../audit/audit.module"
import { FilesModule } from "../files/files.module"
import { PrismaModule } from "../prisma/prisma.module"
import { SecurityModule } from "../security/security.module"
import { TimeClockAdminController, TimeClockPublicController } from "./time-clock.controller"
import { TimeClockService } from "./time-clock.service"

@Module({
  imports: [PrismaModule, AuditModule, FilesModule, SecurityModule],
  controllers: [TimeClockPublicController, TimeClockAdminController],
  providers: [TimeClockService],
  exports: [TimeClockService]
})
export class TimeClockModule {}
