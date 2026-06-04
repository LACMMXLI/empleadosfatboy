import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common"
import { IsNotEmpty, IsString } from "class-validator"
import { Role } from "@prisma/client"
import { Roles } from "../auth/roles.decorator"
import type { RequestWithUser } from "../auth/auth.types"
import { PayrollService } from "./payroll.service"

class GeneratePayrollDto {
  @IsString()
  @IsNotEmpty()
  period_start!: string

  @IsString()
  @IsNotEmpty()
  period_end!: string
}

class CancelPayrollDto {
  @IsString()
  @IsNotEmpty()
  reason!: string
}

@Roles(Role.ADMINISTRADOR)
@Controller("admin/payroll")
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get("preview")
  preview(@Query("start") start: string, @Query("end") end: string) {
    return this.payroll.preview({ periodStart: start, periodEnd: end, rejectDuplicate: true })
  }

  @Post("generate")
  generate(@Body() dto: GeneratePayrollDto, @Req() request: RequestWithUser) {
    return this.payroll.generate(
      { periodStart: dto.period_start, periodEnd: dto.period_end },
      request.user.sub,
      request.ip
    )
  }

  @Get()
  list() {
    return this.payroll.list()
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.payroll.get(id)
  }

  @Post(":id/mark-paid")
  markPaid(@Param("id") id: string, @Req() request: RequestWithUser) {
    return this.payroll.markPaid(id, request.user.sub, request.ip)
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string, @Body() dto: CancelPayrollDto, @Req() request: RequestWithUser) {
    return this.payroll.cancel(id, dto.reason, request.user.sub, request.ip)
  }
}
