import { Body, Controller, Get, Headers, Param, Patch, Post, Req } from "@nestjs/common"
import { IsEnum, IsNumber, IsOptional, IsString, Length, Min, ValidateIf } from "class-validator"
import { MovementKind } from "@prisma/client"
import type { Request } from "express"
import { Public } from "../auth/public.decorator"
import { EmployeePortalService } from "./employee-portal.service"

class EmployeePortalLoginDto {
  @IsString()
  phone!: string

  @IsString()
  @Length(6, 6)
  pin!: string
}

class EmployeeRequestDto {
  @IsEnum(MovementKind)
  kind!: MovementKind

  @IsNumber()
  @Min(0.01)
  amount!: number

  @ValidateIf((o) => o.kind !== MovementKind.DRINK)
  @IsString()
  reason?: string

  @IsOptional()
  @IsString()
  productName?: string

  @IsOptional()
  @IsNumber()
  quantity?: number

  @IsOptional()
  @IsNumber()
  unitPrice?: number
}

class ChangeEmployeeCodeDto {
  @IsString()
  @Length(6, 6)
  currentCode!: string

  @IsString()
  @Length(6, 6)
  newCode!: string
}

@Public()
@Controller("employee-portal")
export class EmployeePortalController {
  constructor(private readonly portal: EmployeePortalService) {}

  @Post("login")
  login(@Body() dto: EmployeePortalLoginDto, @Req() request: Request, @Headers("user-agent") userAgent?: string) {
    return this.portal.login(dto, {
      ipAddress: request.ip,
      userAgent,
      device: this.resolveDevice(userAgent)
    })
  }

  @Get("me")
  me(@Headers("authorization") authorization?: string) {
    return this.portal.me(authorization)
  }

  @Get("options")
  options(@Headers("authorization") authorization?: string) {
    return this.portal.options(authorization)
  }

  @Patch("code")
  changeCode(@Body() dto: ChangeEmployeeCodeDto, @Headers("authorization") authorization?: string) {
    return this.portal.changeCode(dto.currentCode, dto.newCode, authorization)
  }

  @Get("balance")
  balance(@Headers("authorization") authorization?: string) {
    return this.portal.balance(authorization)
  }

  @Get("movements")
  movements(@Headers("authorization") authorization?: string) {
    return this.portal.movements(authorization)
  }

  @Get("movements/:id")
  movementDetail(@Param("id") id: string, @Headers("authorization") authorization?: string) {
    return this.portal.movementDetail(id, authorization)
  }

  @Post("requests")
  createRequest(
    @Body() dto: EmployeeRequestDto,
    @Req() request: Request,
    @Headers("authorization") authorization?: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.portal.createRequest(dto, authorization, {
      ipAddress: request.ip,
      userAgent,
      device: this.resolveDevice(userAgent)
    })
  }

  private resolveDevice(userAgent?: string) {
    if (!userAgent) return "unknown"
    if (/mobile|android|iphone|ipod/i.test(userAgent)) return "mobile"
    if (/ipad|tablet/i.test(userAgent)) return "tablet"
    return "desktop"
  }
}
