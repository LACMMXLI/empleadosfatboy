import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { IsIn, IsOptional, IsString } from "class-validator"
import { memoryStorage } from "multer"
import type { Response } from "express"
import type { RequestWithUser } from "../auth/auth.types"
import { allowedImageMimeTypes, FilesService, maxImageUploadBytes } from "./files.service"

class UploadFileDto {
  @IsIn(["incidencias", "empleados", "checklists"])
  module!: "incidencias" | "empleados" | "checklists"

  @IsOptional()
  @IsString()
  entityId?: string

  @IsOptional()
  @IsString()
  branchId?: string

  @IsOptional()
  @IsString()
  type?: string
}

@Controller("files")
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
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
  upload(@UploadedFile() file: Express.Multer.File | undefined, @Body() dto: UploadFileDto, @Req() request: RequestWithUser) {
    return this.files.upload(dto, file, request.user, request.ip)
  }

  @Get(":id")
  async get(@Param("id") id: string, @Req() request: RequestWithUser, @Res({ passthrough: true }) response: Response) {
    const file = await this.files.get(id, request.user)
    response.setHeader("Content-Type", file.contentType)
    response.setHeader("Content-Length", String(file.contentLength))
    response.setHeader("Content-Disposition", `inline; filename="${file.asset.originalName.replace(/"/g, "")}"`)
    return new StreamableFile(file.body)
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() request: RequestWithUser) {
    return this.files.remove(id, request.user, request.ip)
  }
}
