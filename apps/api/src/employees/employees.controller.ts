import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common"
import { IsBoolean, IsOptional, IsString, Length } from "class-validator"
import { Role } from "@prisma/client"
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
}

@Controller("employees")
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(@Query("q") q?: string, @Query("branchId") branchId?: string, @Query("includeInactive") includeInactive?: string) {
    return this.employees.list({ q, branchId, includeInactive: includeInactive === "true" })
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.employees.get(id)
  }

  @Get(":id/balance")
  balance(@Param("id") id: string) {
    return this.employees.balance(id)
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
