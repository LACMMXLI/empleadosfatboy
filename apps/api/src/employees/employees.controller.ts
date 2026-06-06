import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common"
import { Type } from "class-transformer"
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Length, Min } from "class-validator"
import { Role, SalaryType } from "@prisma/client"
import { Roles } from "../auth/roles.decorator"
import type { RequestWithUser } from "../auth/auth.types"
import { EmployeesService } from "./employees.service"

class EmployeeDto {
  @IsString()
  fullName!: string

  @IsString()
  @Length(6, 6)
  pin!: string

  @IsString()
  position!: string

  @IsString()
  branchId!: string

  @IsString()
  phone!: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salaryAmount?: number

  @IsOptional()
  @IsEnum(SalaryType)
  salaryType?: SalaryType

  @IsOptional()
  @IsString()
  hireDate?: string
}

class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  fullName?: string

  @IsOptional()
  @IsString()
  @Length(6, 6)
  pin?: string

  @IsOptional()
  @IsString()
  position?: string

  @IsOptional()
  @IsString()
  branchId?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsBoolean()
  active?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salaryAmount?: number

  @IsOptional()
  @IsEnum(SalaryType)
  salaryType?: SalaryType

  @IsOptional()
  @IsString()
  hireDate?: string
}

@Controller("employees")
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(
    @Query("q") q: string | undefined,
    @Query("branchId") branchId: string | undefined,
    @Query("includeInactive") includeInactive: string | undefined,
    @Req() request: RequestWithUser
  ) {
    return this.employees.list({ q, branchId, includeInactive: includeInactive === "true" }, request.user)
  }

  @Get(":id")
  get(@Param("id") id: string, @Req() request: RequestWithUser) {
    return this.employees.get(id, request.user)
  }

  @Get(":id/balance")
  balance(@Param("id") id: string, @Req() request: RequestWithUser) {
    return this.employees.balance(id, request.user)
  }

  @Roles(Role.ENCARGADO)
  @Post()
  create(@Body() dto: EmployeeDto, @Req() request: RequestWithUser) {
    return this.employees.create(dto, request.user.sub, request.ip)
  }

  @Roles(Role.ENCARGADO)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateEmployeeDto, @Req() request: RequestWithUser) {
    return this.employees.update(id, dto as any, request.user.sub, request.ip)
  }

  @Roles(Role.ADMINISTRADOR)
  @Delete(":id")
  deactivate(@Param("id") id: string, @Req() request: RequestWithUser) {
    return this.employees.deactivate(id, request.user.sub, request.ip)
  }
}
