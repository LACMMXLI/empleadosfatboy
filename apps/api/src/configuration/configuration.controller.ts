import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common"
import { IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator"
import { MovementKind, Role } from "@prisma/client"
import { Roles } from "../auth/roles.decorator"
import type { RequestWithUser } from "../auth/auth.types"
import { ConfigurationService } from "./configuration.service"

class UpdateConfigDto {
  @IsOptional()
  @IsString()
  businessName?: string

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  beveragePrice?: number

  @IsOptional()
  @IsString()
  receiptLegalText?: string
}

class AuthorizationRuleDto {
  @IsOptional()
  @IsEnum(MovementKind)
  kind?: MovementKind

  @IsNumber()
  @Min(0)
  minAmount!: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number

  @IsEnum(Role)
  requiredRole!: Role
}

class CreateBranchDto {
  @IsString()
  name!: string

  @IsString()
  code!: string

  @IsOptional()
  @IsNumber()
  latitude?: number

  @IsOptional()
  @IsNumber()
  longitude?: number

  @IsOptional()
  @IsNumber()
  @Min(1)
  geofenceRadiusMeters?: number
}

class UpdateBranchDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  code?: string

  @IsOptional()
  active?: boolean

  @IsOptional()
  @IsNumber()
  latitude?: number

  @IsOptional()
  @IsNumber()
  longitude?: number

  @IsOptional()
  @IsNumber()
  @Min(1)
  geofenceRadiusMeters?: number
}

class UpdateRuleDto {
  @IsOptional()
  @IsEnum(MovementKind)
  kind?: MovementKind

  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number

  @IsOptional()
  @IsEnum(Role)
  requiredRole?: Role

  @IsOptional()
  active?: boolean
}

@Controller("configuration")
export class ConfigurationController {
  constructor(private readonly configuration: ConfigurationService) {}

  @Get()
  get() {
    return this.configuration.get()
  }

  @Roles(Role.ADMINISTRADOR)
  @Patch()
  update(@Body() dto: UpdateConfigDto, @Req() request: RequestWithUser) {
    return this.configuration.update(dto, request.user.sub, request.ip)
  }

  @Get("authorization-rules")
  rules() {
    return this.configuration.rules()
  }

  @Get("branches")
  branches(@Query("includeInactive") includeInactive?: string) {
    return this.configuration.branches(includeInactive === "true")
  }

  @Roles(Role.ADMINISTRADOR)
  @Post("branches")
  createBranch(@Body() dto: CreateBranchDto, @Req() request: RequestWithUser) {
    return this.configuration.createBranch(dto, request.user.sub, request.ip)
  }

  @Roles(Role.ADMINISTRADOR)
  @Patch("branches/:id")
  updateBranch(@Param("id") id: string, @Body() dto: UpdateBranchDto, @Req() request: RequestWithUser) {
    return this.configuration.updateBranch(id, dto, request.user.sub, request.ip)
  }

  @Roles(Role.ADMINISTRADOR)
  @Delete("branches/:id")
  deleteBranch(@Param("id") id: string, @Req() request: RequestWithUser) {
    return this.configuration.deleteBranch(id, request.user.sub, request.ip)
  }

  @Roles(Role.ADMINISTRADOR)
  @Post("authorization-rules")
  createRule(@Body() dto: AuthorizationRuleDto, @Req() request: RequestWithUser) {
    return this.configuration.createRule(dto, request.user.sub, request.ip)
  }

  @Roles(Role.ADMINISTRADOR)
  @Patch("authorization-rules/:id")
  updateRule(@Param("id") id: string, @Body() dto: UpdateRuleDto, @Req() request: RequestWithUser) {
    return this.configuration.updateRule(id, dto, request.user.sub, request.ip)
  }

  @Roles(Role.ADMINISTRADOR)
  @Delete("authorization-rules/:id")
  deleteRule(@Param("id") id: string, @Req() request: RequestWithUser) {
    return this.configuration.deleteRule(id, request.user.sub, request.ip)
  }
}
