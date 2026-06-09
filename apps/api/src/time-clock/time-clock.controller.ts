import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from "class-validator"
import { memoryStorage } from "multer"
import type { Response } from "express"
import { Role, TimeClockEventType } from "@prisma/client"
import { Public } from "../auth/public.decorator"
import { Roles } from "../auth/roles.decorator"
import type { RequestWithUser } from "../auth/auth.types"
import { allowedImageMimeTypes, maxImageUploadBytes } from "../files/files.service"
import { TimeClockService } from "./time-clock.service"

class CreateDeviceDto {
  @IsString()
  @MinLength(2)
  name!: string

  @IsString()
  branchId!: string
}

class CreateDeviceRegistrationDto {
  @IsString()
  requestToken!: string
}

class ApproveDeviceRegistrationDto {
  @IsString()
  @MinLength(2)
  name!: string

  @IsString()
  branchId!: string
}

class UpdateDeviceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string

  @IsOptional()
  @IsString()
  branchId?: string

  @IsOptional()
  @IsBoolean()
  active?: boolean

  @IsOptional()
  @IsBoolean()
  rotateToken?: boolean
}

class RegisterEntryDto {
  @IsString()
  employeeId!: string

  @IsEnum(TimeClockEventType)
  type!: TimeClockEventType

  @IsString()
  pin!: string
}

class AttendanceQuery {
  @IsOptional()
  @IsString()
  date?: string

  @IsOptional()
  @IsString()
  branchId?: string

  @IsOptional()
  @IsString()
  employeeId?: string
}

class HistoryQuery {
  @IsOptional()
  @IsString()
  from?: string

  @IsOptional()
  @IsString()
  to?: string
}

class CreateAdjustmentDto {
  @IsString()
  employeeId!: string

  @IsOptional()
  @IsString()
  branchId?: string

  @IsEnum(TimeClockEventType)
  type!: TimeClockEventType

  @IsOptional()
  @IsString()
  occurredAt?: string

  @IsString()
  @MinLength(5)
  reason!: string

  @IsOptional()
  @IsString()
  notes?: string
}

@Public()
@Controller("time-clock/public")
export class TimeClockPublicController {
  constructor(private readonly timeClock: TimeClockService) {}

  @Get("device")
  device(@Headers("x-time-clock-device") token?: string) {
    return this.timeClock.publicDevice(token)
  }

  @Get("employees")
  employees(@Headers("x-time-clock-device") token?: string) {
    return this.timeClock.publicEmployees(token)
  }

  @Post("device-requests")
  deviceRequest(@Body() dto: CreateDeviceRegistrationDto, @Req() request: RequestWithUser) {
    return this.timeClock.createDeviceRegistration(dto, {
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] as string | undefined
    })
  }

  @Post("entries")
  @UseInterceptors(
    FileInterceptor("photo", {
      storage: memoryStorage(),
      limits: { fileSize: maxImageUploadBytes },
      fileFilter: (_request, file, callback) => {
        if (!allowedImageMimeTypes.includes(file.mimetype as (typeof allowedImageMimeTypes)[number])) {
          callback(new BadRequestException("Solo se permiten imagenes JPEG, PNG o WEBP"), false)
          return
        }
        callback(null, true)
      }
    })
  )
  entry(
    @Headers("x-time-clock-device") token: string | undefined,
    @UploadedFile() photo: Express.Multer.File | undefined,
    @Body() dto: RegisterEntryDto,
    @Req() request: RequestWithUser
  ) {
    return this.timeClock.registerEntry(token, dto, photo, {
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] as string | undefined
    })
  }
}

@Roles(Role.ENCARGADO)
@Controller("admin/time-clock")
export class TimeClockAdminController {
  constructor(private readonly timeClock: TimeClockService) {}

  @Get("devices")
  devices(@Req() request: RequestWithUser) {
    return this.timeClock.listDevices(request.user)
  }

  @Post("devices")
  createDevice(@Body() dto: CreateDeviceDto, @Req() request: RequestWithUser) {
    return this.timeClock.createDevice(dto, request.user, request.ip)
  }

  @Get("device-requests")
  deviceRequests(@Req() request: RequestWithUser) {
    return this.timeClock.listDeviceRequests(request.user)
  }

  @Patch("device-requests/:id/approve")
  approveDeviceRequest(@Param("id") id: string, @Body() dto: ApproveDeviceRegistrationDto, @Req() request: RequestWithUser) {
    return this.timeClock.approveDeviceRegistration(id, dto, request.user, request.ip)
  }

  @Patch("device-requests/:id/reject")
  rejectDeviceRequest(@Param("id") id: string, @Req() request: RequestWithUser) {
    return this.timeClock.rejectDeviceRegistration(id, request.user, request.ip)
  }

  @Patch("devices/:id")
  updateDevice(@Param("id") id: string, @Body() dto: UpdateDeviceDto, @Req() request: RequestWithUser) {
    return this.timeClock.updateDevice(id, dto, request.user, request.ip)
  }

  @Get("attendance")
  attendance(@Query() query: AttendanceQuery, @Req() request: RequestWithUser) {
    return this.timeClock.attendance(query, request.user)
  }

  @Get("export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  exportAttendance(@Query() query: AttendanceQuery, @Req() request: RequestWithUser, @Res({ passthrough: true }) response: Response) {
    response.setHeader("Content-Disposition", `attachment; filename="asistencia-${query.date ?? "hoy"}.csv"`)
    return this.timeClock.exportAttendance(query, request.user)
  }

  @Get("employees/:employeeId/history")
  employeeHistory(@Param("employeeId") employeeId: string, @Query() query: HistoryQuery, @Req() request: RequestWithUser) {
    return this.timeClock.employeeHistory(employeeId, query, request.user)
  }

  @Get("adjustments")
  adjustments(@Query() query: AttendanceQuery, @Req() request: RequestWithUser) {
    return this.timeClock.adjustments(query, request.user)
  }

  @Post("adjustments")
  createAdjustment(@Body() dto: CreateAdjustmentDto, @Req() request: RequestWithUser) {
    return this.timeClock.createManualAdjustment(dto, request.user, request.ip)
  }
}
