import { Controller, Get } from "@nestjs/common"
import { Public } from "./auth/public.decorator"

@Controller("health")
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      ok: true,
      service: "employee-ledger-api",
      timestamp: new Date().toISOString()
    }
  }
}
