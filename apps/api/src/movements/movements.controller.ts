import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common"
import { IsEnum, IsNumber, IsOptional, IsString, Length, Min, ValidateIf } from "class-validator"
import { MovementKind, MovementStatus, Role } from "@prisma/client"
import { Roles } from "../auth/roles.decorator"
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
}

@Controller("movements")
export class MovementsController {
  constructor(private readonly movements: MovementsService) {}

  @Get()
  list(@Query() query: ListMovementQuery, @Req() request: RequestWithUser) {
    return this.movements.list(query, request.user)
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
    return this.movements.create(dto, request.user, request.ip)
  }

  @Roles(Role.GERENTE)
  @Post("administrative")
  createAdministrative(@Body() dto: CreateAdministrativeMovementDto, @Req() request: RequestWithUser) {
    return this.movements.createAdministrative(dto, request.user, request.ip)
  }

  @Roles(Role.ENCARGADO)
  @Patch(":id/authorize")
  authorize(@Param("id") id: string, @Req() request: RequestWithUser) {
    return this.movements.authorize(id, request.user, request.ip)
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
