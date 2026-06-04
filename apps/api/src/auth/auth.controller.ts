import { Body, Controller, Get, Post, Req } from "@nestjs/common"
import type { Request } from "express"
import { IsEmail, IsString, MinLength } from "class-validator"
import { Public } from "./public.decorator"
import { AuthService } from "./auth.service"
import type { RequestWithUser } from "./auth.types"

class LoginDto {
  @IsEmail()
  email!: string

  @IsString()
  @MinLength(6)
  password!: string
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.auth.login(dto.email, dto.password, request.ip)
  }

  @Get("me")
  me(@Req() request: RequestWithUser) {
    return this.auth.me(request.user.sub)
  }
}
