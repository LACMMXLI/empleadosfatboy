import { Controller, Get, Req } from "@nestjs/common"
import type { RequestWithUser } from "../auth/auth.types"
import { DashboardService } from "./dashboard.service"

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  summary(@Req() request: RequestWithUser) {
    return this.dashboard.summary(request.user)
  }
}
