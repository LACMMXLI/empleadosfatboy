import { Module } from "@nestjs/common"
import { TimeClockModule } from "../time-clock/time-clock.module"
import { MovementsController } from "./movements.controller"
import { MovementsService } from "./movements.service"

@Module({
  imports: [TimeClockModule],
  controllers: [MovementsController],
  providers: [MovementsService],
  exports: [MovementsService]
})
export class MovementsModule {}
