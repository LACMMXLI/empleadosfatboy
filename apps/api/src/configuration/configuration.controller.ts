import { Body, Controller, Get, Patch, Post, Req } from "@nestjs/common"
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
  branches() {
    return this.configuration.branches()
  }

  @Roles(Role.ADMINISTRADOR)
  @Post("authorization-rules")
  createRule(@Body() dto: AuthorizationRuleDto, @Req() request: RequestWithUser) {
    return this.configuration.createRule(dto, request.user.sub, request.ip)
  }
}
