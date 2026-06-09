import { Module } from "@nestjs/common"
import { AuditModule } from "../audit/audit.module"
import { PrismaModule } from "../prisma/prisma.module"
import { FilesController } from "./files.controller"
import { FilesService } from "./files.service"

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService]
})
export class FilesModule {}
