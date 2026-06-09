import { Module } from "@nestjs/common"
import { AuditModule } from "../audit/audit.module"
import { FilesModule } from "../files/files.module"
import { PrismaModule } from "../prisma/prisma.module"
import { IncidentsController } from "./incidents.controller"
import { IncidentsService } from "./incidents.service"

@Module({
  imports: [PrismaModule, AuditModule, FilesModule],
  controllers: [IncidentsController],
  providers: [IncidentsService]
})
export class IncidentsModule {}
