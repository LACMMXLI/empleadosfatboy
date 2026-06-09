import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common"
import { IsEnum, IsOptional, IsString } from "class-validator"
import { IncidentStatus, Role } from "@prisma/client"
import { Roles } from "../auth/roles.decorator"
import type { RequestWithUser } from "../auth/auth.types"
import { IncidentsService } from "./incidents.service"

class CreateIncidentDto {
  @IsString()
  title!: string

  @IsString()
  description!: string

  @IsOptional()
  @IsString()
  employeeId?: string

  @IsOptional()
  @IsString()
  branchId?: string
}

class ListIncidentQuery {
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus

  @IsOptional()
  @IsString()
  employeeId?: string

  @IsOptional()
  @IsString()
  branchId?: string

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

class UpdateIncidentStatusDto {
  @IsEnum(IncidentStatus)
  status!: IncidentStatus

  @IsOptional()
  @IsString()
  message?: string
}

class AddIncidentMessageDto {
  @IsString()
  message!: string
}

@Roles(Role.ENCARGADO)
@Controller("admin/incidents")
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  list(@Query() query: ListIncidentQuery, @Req() request: RequestWithUser) {
    return this.incidents.list(query, request.user)
  }

  @Post()
  create(@Body() dto: CreateIncidentDto, @Req() request: RequestWithUser) {
    return this.incidents.create(dto, request.user, request.ip)
  }

  @Get(":id")
  get(@Param("id") id: string, @Req() request: RequestWithUser) {
    return this.incidents.get(id, request.user)
  }

  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateIncidentStatusDto, @Req() request: RequestWithUser) {
    return this.incidents.updateStatus(id, dto, request.user, request.ip)
  }

  @Post(":id/messages")
  addMessage(@Param("id") id: string, @Body() dto: AddIncidentMessageDto, @Req() request: RequestWithUser) {
    return this.incidents.addMessage(id, dto.message, request.user, request.ip)
  }
}
