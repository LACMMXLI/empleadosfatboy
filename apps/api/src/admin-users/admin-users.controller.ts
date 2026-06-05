import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common"
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator"
import { Role } from "@prisma/client"
import { Roles } from "../auth/roles.decorator"
import type { RequestWithUser } from "../auth/auth.types"
import { AdminUsersService } from "./admin-users.service"

const adminUserRoles = [Role.ADMINISTRADOR, Role.GERENTE, Role.ENCARGADO, Role.CAJERO] as const

class CreateAdminUserDto {
  @IsString()
  fullName!: string

  @IsEmail()
  email!: string

  @IsString()
  @MinLength(8)
  password!: string

  @IsEnum(adminUserRoles)
  role!: Role

  @IsOptional()
  @IsString()
  branchId?: string
}

class UpdateAdminUserDto {
  @IsOptional()
  @IsString()
  fullName?: string

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string

  @IsOptional()
  @IsEnum(adminUserRoles)
  role?: Role

  @IsOptional()
  @IsBoolean()
  active?: boolean

  @IsOptional()
  @IsString()
  branchId?: string
}

@Roles(Role.ADMINISTRADOR)
@Controller("admin/users")
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list() {
    return this.users.list()
  }

  @Post()
  create(@Body() dto: CreateAdminUserDto, @Req() request: RequestWithUser) {
    return this.users.create(dto, request.user.sub, request.user.branchId ?? undefined, request.ip)
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateAdminUserDto, @Req() request: RequestWithUser) {
    return this.users.update(id, dto, request.user.sub, request.ip)
  }
}
