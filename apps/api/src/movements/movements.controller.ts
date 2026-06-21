import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from "@nestjs/common"
import { IsEnum, IsNumber, IsOptional, IsString, Length, Max, Min, ValidateIf } from "class-validator"
import { MovementKind, MovementStatus, Role } from "@prisma/client"
import { Roles } from "../auth/roles.decorator"
import { Public } from "../auth/public.decorator"
import type { RequestWithUser } from "../auth/auth.types"
import { MovementsService } from "./movements.service"

class CreateMovementDto {
  @IsString()
  employeeId!: string

  @IsEnum(MovementKind)
  kind!: MovementKind

  @IsNumber()
  @Min(0.01)
  amount!: number

  @ValidateIf((o) => o.kind !== MovementKind.DRINK)
  @IsString()
  reason?: string

  @IsString()
  @Length(6, 6)
  employeePin!: string

  @IsOptional()
  @IsString()
  productName?: string

  @IsOptional()
  @IsNumber()
  quantity?: number

  @IsOptional()
  @IsNumber()
  unitPrice?: number

  @IsOptional()
  @IsString()
  evidenceNote?: string
}

class CreateAdministrativeMovementDto {
  @IsString()
  employeeId!: string

  @IsEnum(MovementKind)
  kind!: MovementKind

  @IsNumber()
  @Min(0.01)
  amount!: number

  @IsString()
  reason!: string

  @IsOptional()
  @IsString()
  productName?: string

  @IsOptional()
  @IsNumber()
  quantity?: number

  @IsOptional()
  @IsNumber()
  unitPrice?: number

  @IsOptional()
  @IsString()
  evidenceNote?: string
}

class ListMovementQuery {
  @IsOptional()
  @IsString()
  employeeId?: string

  @IsOptional()
  @IsString()
  branchId?: string

  @IsOptional()
  @IsEnum(MovementKind)
  kind?: MovementKind

  @IsOptional()
  @IsEnum(MovementStatus)
  status?: MovementStatus

  @IsOptional()
  @IsString()
  from?: string

  @IsOptional()
  @IsString()
  to?: string

  @IsOptional()
  @IsString()
  q?: string

  @IsOptional()
  @IsString()
  delivered?: string
}

class SettlementQuery {
  @IsString()
  employeeId!: string

  @IsOptional()
  @IsString()
  from?: string

  @IsOptional()
  @IsString()
  to?: string
}

class SettleMovementsDto {
  @IsString()
  employeeId!: string

  @IsOptional()
  @IsString()
  from?: string

  @IsOptional()
  @IsString()
  to?: string
}

class TimeClockSalaryAdvanceDto {
  @IsString()
  @Length(6, 6)
  employeeCode!: string

  @IsString()
  @Length(6, 6)
  approverCode!: string

  @IsNumber()
  @Min(0.01)
  @Max(50_000)
  amount!: number

  @IsOptional()
  @IsString()
  reason?: string
}

@Public()
@Controller("time-clock/public")
export class TimeClockMovementsController {
  constructor(private readonly movements: MovementsService) {}

  @Post("salary-advances")
  salaryAdvance(
    @Headers("x-time-clock-device") token: string | undefined,
    @Body() dto: TimeClockSalaryAdvanceDto,
    @Req() request: RequestWithUser
  ) {
    return this.movements.createTimeClockSalaryAdvance(token, dto, {
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] as string | undefined
    })
  }
}

@Controller("movements")
export class MovementsController {
  constructor(private readonly movements: MovementsService) {}

  @Get()
  list(@Query() query: ListMovementQuery, @Req() request: RequestWithUser) {
    return this.movements.list(query, request.user)
  }

  @Roles(Role.GERENTE)
  @Get("settlement-summary")
  settlementSummary(@Query() query: SettlementQuery, @Req() request: RequestWithUser) {
    return this.movements.settlementSummary(query, request.user)
  }

  @Roles(Role.GERENTE)
  @Patch("settlements")
  settleEmployeeRange(@Body() dto: SettleMovementsDto, @Req() request: RequestWithUser) {
    return this.movements.settleEmployeeRange(dto, request.user, request.ip)
  }

  @Get(":id")
  get(@Param("id") id: string, @Req() request: RequestWithUser) {
    return this.movements.get(id, request.user)
  }

  @Get(":id/receipt")
  receipt(@Param("id") id: string, @Req() request: RequestWithUser) {
    return this.movements.receipt(id, request.user)
  }

  @Get(":id/audit")
  audit(@Param("id") id: string, @Req() request: RequestWithUser) {
    return this.movements.auditTrail(id, request.user)
  }

  @Roles(Role.CAJERO)
  @Post()
  create(@Body() dto: CreateMovementDto, @Req() request: RequestWithUser) {
    return this.movements.create(dto, request.user, {
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] as string | undefined,
      device: request.headers["x-device-id"] as string | undefined
    })
  }

  @Roles(Role.GERENTE)
  @Post("administrative")
  createAdministrative(@Body() dto: CreateAdministrativeMovementDto, @Req() request: RequestWithUser) {
    return this.movements.createAdministrative(dto, request.user, {
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] as string | undefined,
      device: request.headers["x-device-id"] as string | undefined
    })
  }

  @Roles(Role.ENCARGADO)
  @Patch(":id/authorize")
  authorize(@Param("id") id: string, @Req() request: RequestWithUser) {
    return this.movements.authorize(id, request.user, request.ip)
  }

  @Roles(Role.CAJERO)
  @Patch(":id/deliver")
  deliver(@Param("id") id: string, @Req() request: RequestWithUser) {
    return this.movements.deliver(id, request.user, request.ip)
  }

  @Roles(Role.ENCARGADO)
  @Patch(":id/reject")
  reject(@Param("id") id: string, @Req() request: RequestWithUser) {
    return this.movements.reject(id, request.user, request.ip)
  }

  @Roles(Role.ADMINISTRADOR)
  @Patch(":id/cancel")
  cancel(@Param("id") id: string, @Req() request: RequestWithUser) {
    return this.movements.cancel(id, request.user, request.ip)
  }

  @Roles(Role.ENCARGADO)
  @Patch(":id/discount")
  markDiscounted(@Param("id") id: string, @Req() request: RequestWithUser) {
    return this.movements.markDiscounted(id, request.user, request.ip)
  }
}
