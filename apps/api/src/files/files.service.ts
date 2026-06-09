import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { AuditAction, FileAsset, FileAssetModule, Prisma, Role } from "@prisma/client"
import { randomUUID } from "crypto"
import type { Readable } from "stream"
import { AuditService } from "../audit/audit.service"
import type { AuthUser } from "../auth/auth.types"
import { PrismaService } from "../prisma/prisma.service"

export const allowedImageMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const
export const maxImageUploadBytes = 5 * 1024 * 1024

export type UploadFileInput = {
  module: "incidencias" | "empleados" | "checklists"
  entityId?: string
  branchId?: string
  type?: string
}

type ResolvedUploadTarget = {
  module: FileAssetModule
  key: string
  entityId?: string
  branchId?: string
}

type S3Config = {
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  region: string
  forcePathStyle: boolean
}

const mimeExtension: Record<(typeof allowedImageMimeTypes)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
}

@Injectable()
export class FilesService {
  private s3?: S3Client
  private s3Config?: S3Config

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService
  ) {}

  async upload(input: UploadFileInput, file: Express.Multer.File | undefined, user: AuthUser, ipAddress?: string) {
    if (!file) throw new BadRequestException("Archivo requerido")
    this.validateImage(file)

    const target = await this.resolveUploadTarget(input, file, user)
    const s3Config = this.getS3Config()

    await this.putObject(target.key, file)

    try {
      const asset = await this.prisma.fileAsset.create({
        data: {
          bucket: s3Config.bucket,
          key: target.key,
          originalName: this.cleanOriginalName(file.originalname),
          mimeType: file.mimetype,
          size: file.size,
          module: target.module,
          entityId: target.entityId,
          branchId: target.branchId,
          uploadedByUserId: user.sub
        }
      })

      await this.audit.log({
        userId: user.sub,
        action: AuditAction.CREATE,
        entity: "FileAsset",
        entityId: asset.id,
        newValue: this.toJson(asset),
        ipAddress
      })

      return this.toResponse(asset)
    } catch (error) {
      await this.deleteObjectQuietly(target.key)
      throw error
    }
  }

  async get(id: string, user: AuthUser) {
    const asset = await this.findVisibleAsset(id, user)
    const object = await this.getObject(asset.key)

    return {
      asset,
      body: object.Body as Readable,
      contentLength: object.ContentLength ?? asset.size,
      contentType: object.ContentType ?? asset.mimeType
    }
  }

  async remove(id: string, user: AuthUser, ipAddress?: string) {
    const asset = await this.findVisibleAsset(id, user)

    if (!this.canDelete(asset, user)) {
      throw new ForbiddenException("No puedes eliminar este archivo")
    }

    await this.deleteObject(asset.key)
    const deleted = await this.prisma.fileAsset.update({
      where: { id: asset.id },
      data: { deletedAt: new Date() }
    })

    await this.audit.log({
      userId: user.sub,
      action: AuditAction.DELETE,
      entity: "FileAsset",
      entityId: asset.id,
      oldValue: this.toJson(asset),
      newValue: this.toJson(deleted),
      ipAddress
    })

    return { id: deleted.id, deleted: true }
  }

  private validateImage(file: Express.Multer.File) {
    if (!allowedImageMimeTypes.includes(file.mimetype as (typeof allowedImageMimeTypes)[number])) {
      throw new BadRequestException("Solo se permiten imagenes JPEG, PNG o WEBP")
    }
    if (file.size > maxImageUploadBytes) {
      throw new BadRequestException("La imagen no puede superar 5 MB")
    }
  }

  private async resolveUploadTarget(input: UploadFileInput, file: Express.Multer.File, user: AuthUser) {
    const ext = mimeExtension[file.mimetype as (typeof allowedImageMimeTypes)[number]]
    const id = randomUUID()
    const now = new Date()
    const year = String(now.getFullYear())
    const month = String(now.getMonth() + 1).padStart(2, "0")

    if (input.module === "incidencias") {
      const branchId = await this.resolveBranchForWrite(input.branchId, user)
      return {
        module: FileAssetModule.INCIDENCIAS,
        branchId,
        entityId: input.entityId?.trim() || undefined,
        key: `incidencias/${branchId}/${year}/${month}/${id}.${ext}`
      }
    }

    if (input.module === "empleados") {
      const employeeId = input.entityId?.trim()
      if (!employeeId) throw new BadRequestException("entityId del empleado requerido")
      const employee = await this.resolveEmployeeForWrite(employeeId, user)
      return {
        module: FileAssetModule.EMPLEADOS,
        branchId: employee.branchId,
        entityId: employee.id,
        key: `empleados/${employee.id}/${id}.${ext}`
      }
    }

    if (input.module === "checklists") {
      const branchId = await this.resolveBranchForWrite(input.branchId, user)
      const type = this.safeSegment(input.type, "type de checklist requerido")
      return {
        module: FileAssetModule.CHECKLISTS,
        branchId,
        entityId: input.entityId?.trim() || undefined,
        key: `checklists/${branchId}/${type}/${year}/${month}/${id}.${ext}`
      }
    }

    throw new BadRequestException("Modulo de archivo no permitido")
  }

  private async resolveBranchForWrite(branchId: string | undefined, user: AuthUser) {
    const effectiveBranchId = branchId?.trim() || user.branchId
    if (!effectiveBranchId) throw new BadRequestException("branchId requerido")

    if (
      (user.role === Role.CAJERO || user.role === Role.ENCARGADO || user.role === Role.EMPLEADO) &&
      user.branchId !== effectiveBranchId
    ) {
      throw new ForbiddenException("No puedes subir archivos para otra sucursal")
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: effectiveBranchId, active: true },
      select: { id: true }
    })
    if (!branch) throw new NotFoundException("Sucursal no encontrada")
    return branch.id
  }

  private async resolveEmployeeForWrite(employeeId: string, user: AuthUser) {
    if (user.role === Role.EMPLEADO && user.employeeId !== employeeId) {
      throw new ForbiddenException("El empleado solo puede subir archivos de su propio perfil")
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        active: true,
        ...(user.role === Role.CAJERO || user.role === Role.ENCARGADO
          ? { branchId: user.branchId ?? "__none__" }
          : {})
      },
      select: { id: true, branchId: true }
    })
    if (!employee) throw new NotFoundException("Empleado no encontrado o fuera de alcance")
    return employee
  }

  private async findVisibleAsset(id: string, user: AuthUser) {
    const asset = await this.prisma.fileAsset.findFirst({
      where: { id, deletedAt: null }
    })
    if (!asset || !this.canRead(asset, user)) {
      throw new NotFoundException("Archivo no encontrado")
    }
    return asset
  }

  private canRead(asset: FileAsset, user: AuthUser) {
    if (user.role === Role.ADMINISTRADOR || user.role === Role.GERENTE) return true
    if (user.role === Role.CAJERO || user.role === Role.ENCARGADO) return asset.branchId === user.branchId
    if (user.role === Role.EMPLEADO) {
      return (
        asset.uploadedByUserId === user.sub ||
        (asset.module === FileAssetModule.EMPLEADOS && asset.entityId === user.employeeId)
      )
    }
    return false
  }

  private canDelete(asset: FileAsset, user: AuthUser) {
    if (user.role === Role.ADMINISTRADOR || user.role === Role.GERENTE) return true
    if (asset.uploadedByUserId === user.sub) return true
    return user.role === Role.ENCARGADO && asset.branchId === user.branchId
  }

  private async putObject(key: string, file: Express.Multer.File) {
    const s3Config = this.getS3Config()
    await this.getS3().send(
      new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size
      })
    )
  }

  private async getObject(key: string) {
    const s3Config = this.getS3Config()
    try {
      const object = await this.getS3().send(new GetObjectCommand({ Bucket: s3Config.bucket, Key: key }))
      if (!object.Body) throw new NotFoundException("Archivo no encontrado en almacenamiento")
      return object
    } catch (error) {
      if (error instanceof NotFoundException) throw error
      if (this.isObjectMissing(error)) throw new NotFoundException("Archivo no encontrado en almacenamiento")
      throw new ServiceUnavailableException("No se pudo leer el archivo desde MinIO")
    }
  }

  private async deleteObject(key: string) {
    const s3Config = this.getS3Config()
    try {
      await this.getS3().send(new DeleteObjectCommand({ Bucket: s3Config.bucket, Key: key }))
    } catch {
      throw new ServiceUnavailableException("No se pudo eliminar el archivo desde MinIO")
    }
  }

  private async deleteObjectQuietly(key: string) {
    try {
      await this.deleteObject(key)
    } catch {
      return
    }
  }

  private getS3() {
    const s3Config = this.getS3Config()
    if (!this.s3) {
      this.s3 = new S3Client({
        endpoint: s3Config.endpoint,
        region: s3Config.region,
        forcePathStyle: s3Config.forcePathStyle,
        credentials: {
          accessKeyId: s3Config.accessKeyId,
          secretAccessKey: s3Config.secretAccessKey
        }
      })
    }
    return this.s3
  }

  private getS3Config() {
    if (this.s3Config) return this.s3Config

    const endpoint = this.requiredConfig("S3_ENDPOINT")
    const accessKeyId = this.requiredConfig("S3_ACCESS_KEY")
    const secretAccessKey = this.requiredConfig("S3_SECRET_KEY")
    const bucket = this.requiredConfig("S3_BUCKET")
    const region = this.config.get<string>("S3_REGION")?.trim() || "us-east-1"
    const forcePathStyle = this.booleanConfig("S3_FORCE_PATH_STYLE", true)

    this.validateEndpoint(endpoint)
    this.s3Config = { endpoint, accessKeyId, secretAccessKey, bucket, region, forcePathStyle }
    return this.s3Config
  }

  private requiredConfig(key: string) {
    const value = this.config.get<string>(key)?.trim()
    if (!value) throw new ServiceUnavailableException(`${key} no configurado`)
    return value
  }

  private booleanConfig(key: string, fallback: boolean) {
    const value = this.config.get<string>(key)
    if (value === undefined || value === null || value === "") return fallback
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())
  }

  private validateEndpoint(endpoint: string) {
    try {
      const url = new URL(endpoint)
      const host = url.hostname.toLowerCase()
      if (process.env.NODE_ENV === "production" && ["127.0.0.1", "localhost", "0.0.0.0"].includes(host)) {
        throw new ServiceUnavailableException("S3_ENDPOINT debe usar el hostname interno de MinIO, no localhost")
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error
      throw new InternalServerErrorException("S3_ENDPOINT invalido")
    }
  }

  private safeSegment(value: string | undefined, message: string) {
    const segment = value?.trim()
    if (!segment) throw new BadRequestException(message)
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(segment)) {
      throw new BadRequestException("El segmento de ruta solo permite letras, numeros, guion y guion bajo")
    }
    return segment
  }

  private cleanOriginalName(value: string) {
    return value.replace(/[^\w.\- ]/g, "").slice(0, 180) || "imagen"
  }

  private isObjectMissing(error: unknown) {
    const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name?: unknown }).name) : ""
    return ["NoSuchKey", "NotFound"].includes(name)
  }

  private toResponse(asset: FileAsset) {
    return {
      id: asset.id,
      bucket: asset.bucket,
      key: asset.key,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      size: asset.size,
      module: asset.module,
      entityId: asset.entityId,
      branchId: asset.branchId,
      url: `/files/${asset.id}`,
      apiUrl: `/api/files/${asset.id}`,
      createdAt: asset.createdAt
    }
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
  }
}
