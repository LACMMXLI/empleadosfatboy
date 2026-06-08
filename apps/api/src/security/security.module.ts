import { Module } from "@nestjs/common"
import { LoginThrottleService } from "./login-throttle.service"

@Module({
  providers: [LoginThrottleService],
  exports: [LoginThrottleService]
})
export class SecurityModule {}
