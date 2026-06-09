import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { AuditAction, FileAssetModule, IncidentStatus, Prisma, Role } from "@prisma/client"
import { AuditService } from "../audit/audit.service"
import type { AuthUser } from "../auth/auth.types"
import { PrismaService } from "../prisma/prisma.service"

type CreateIncidentInput = {
  title: string
  description: string
  employeeId?: string
  branchId?: string
}

type IncidentFilters = {
  status?: IncidentStatus
  employeeId?: string
  branchId?: string
  from?: string
  to?: string
  q?: string
}

type UpdateStatusInput = {
  status: IncidentStatus
  message?: string
}

type IncidentEvidenceResponse = {
  id: string
  bucket: string
  key: string
  originalName: string
  mimeType: string
  size: number
  module: FileAssetModule
  entityId: string | null
  branchId: string | null
  url: string
  apiUrl: string
  createdAt: Date
}

const terminalStatuses = new Set<IncidentStatus>([IncidentStatus.RESUELTA, IncidentStatus.CERRADA])

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(filters: IncidentFilters, user: AuthUser) {
    const incidents = await this.prisma.incident.findMany({
      where: this.buildWhere(filters, user),
      include: this.includeSummary(),
      orderBy: { createdAt: "desc" },
      take: 100
    })

    return this.withEvidence(incidents)
  }

  async get(id: string, user: AuthUser) {
    const incident = await this.findVisibleIncident(id, user)
    const evidence = await this.findEvidence([incident.id])
    return { ...incident, evidence: evidence.get(incident.id) ?? [] }
  }

  async create(input: CreateIncidentInput, user: AuthUser, ipAddress?: string) {
    const title = input.title.trim()
    const description = input.description.trim()
    if (title.length < 3) throw new BadRequestException("Titulo de incidencia requerido")
    if (description.length < 3) throw new BadRequestException("Descripcion de incidencia requerida")

    const target = await this.resolveTarget(input, user)
    const incident = await this.prisma.incident.create({
      data: {
        folio: await this.nextFolio(),
        title,
        description,
        employeeId: target.employeeId,
        branchId: target.branchId,
        reportedByUserId: user.sub
      },
      include: this.includeSummary()
    })

    await this.audit.log({
      userId: user.sub,
      action: AuditAction.CREATE,
      entity: "Incident",
      entityId: incident.id,
      affectedEmployeeId: incident.employeeId ?? undefined,
      newValue: this.toJson(incident),
      ipAddress
    })

    return { ...incident, evidence: [] }
  }

  async updateStatus(id: string, input: UpdateStatusInput, user: AuthUser, ipAddress?: string) {
    const before = await this.findVisibleIncident(id, user)
    if (before.status === IncidentStatus.CERRADA && input.status !== IncidentStatus.CERRADA) {
      throw new BadRequestException("Una incidencia cerrada no puede reabrirse desde este flujo")
    }

    const message = input.message?.trim()
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.incident.update({
        where: { id },
        data: {
          status: input.status,
          viewedAt: input.status === IncidentStatus.VISTA && !before.viewedAt ? new Date() : before.viewedAt,
          resolvedAt: input.status === IncidentStatus.RESUELTA ? new Date() : before.resolvedAt,
          closedAt: input.status === IncidentStatus.CERRADA ? new Date() : before.closedAt
        },
        include: this.includeSummary()
      })

      if (message) {
        await tx.incidentMessage.create({
          data: {
            incidentId: id,
            authorId: user.sub,
            message
          }
        })
      }

      await tx.auditLog.create({
        data: {
          userId: user.sub,
          action: AuditAction.STATUS_CHANGE,
          entity: "Incident",
          entityId: id,
          affectedEmployeeId: before.employeeId ?? undefined,
          oldValue: this.toJson(before),
          newValue: this.toJson({ status: input.status, message }),
          ipAddress
        }
      })

      return changed
    })

    return this.get(updated.id, user)
  }

  async addMessage(id: string, rawMessage: string, user: AuthUser, ipAddress?: string) {
    const incident = await this.findVisibleIncident(id, user)
    if (terminalStatuses.has(incident.status)) {
      throw new BadRequestException("No se pueden agregar comentarios a una incidencia terminada")
    }

    const message = rawMessage.trim()
    if (message.length < 2) throw new BadRequestException("Comentario requerido")

    await this.prisma.$transaction([
      this.prisma.incidentMessage.create({
        data: {
          incidentId: id,
          authorId: user.sub,
          message
        }
      }),
      this.prisma.auditLog.create({
        data: {
          userId: user.sub,
          action: AuditAction.CREATE,
          entity: "IncidentMessage",
          entityId: id,
          affectedEmployeeId: incident.employeeId ?? undefined,
          newValue: this.toJson({ message }),
          ipAddress
        }
      })
    ])

    return this.get(id, user)
  }

  private async resolveTarget(input: CreateIncidentInput, user: AuthUser) {
    if (input.employeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: {
          id: input.employeeId,
          active: true,
          ...(user.role === Role.ENCARGADO ? { branchId: user.branchId ?? "__none__" } : {})
        },
        select: { id: true, branchId: true }
      })
      if (!employee) throw new NotFoundException("Empleado no encontrado o fuera de alcance")
      return { employeeId: employee.id, branchId: employee.branchId }
    }

    const branchId = input.branchId?.trim() || user.branchId
    if (!branchId) {
      const fallbackBranch = await this.prisma.branch.findFirst({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true }
      })
      if (!fallbackBranch) throw new BadRequestException("Selecciona sucursal o empleado")
      return { employeeId: undefined, branchId: fallbackBranch.id }
    }

    if (user.role === Role.ENCARGADO && user.branchId !== branchId) {
      throw new ForbiddenException("No puedes crear incidencias para otra sucursal")
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, active: true },
      select: { id: true }
    })
    if (!branch) throw new NotFoundException("Sucursal no encontrada")
    return { employeeId: undefined, branchId: branch.id }
  }

  private async findVisibleIncident(id: string, user: AuthUser) {
    const incident = await this.prisma.incident.findFirst({
      where: this.andWhere({ id }, this.scopeForUser(user)),
      include: this.includeDetail()
    })
    if (!incident) throw new NotFoundException("Incidencia no encontrada")
    return incident
  }

  private async withEvidence<T extends { id: string }>(incidents: T[]) {
    const evidence = await this.findEvidence(incidents.map((incident) => incident.id))
    return incidents.map((incident) => ({ ...incident, evidence: evidence.get(incident.id) ?? [] }))
  }

  private async findEvidence(ids: string[]) {
    const grouped = new Map<string, IncidentEvidenceResponse[]>()
    if (!ids.length) return grouped

    const files = await this.prisma.fileAsset.findMany({
      where: {
        module: FileAssetModule.INCIDENCIAS,
        entityId: { in: ids },
        deletedAt: null
      },
      orderBy: { createdAt: "asc" }
    })

    for (const file of files) {
      const entityId = file.entityId ?? ""
      const list = grouped.get(entityId) ?? []
      list.push(this.toFileResponse(file))
      grouped.set(entityId, list)
    }
    return grouped
  }

  private buildWhere(filters: IncidentFilters, user: AuthUser): Prisma.IncidentWhereInput {
    return this.andWhere(this.scopeForUser(user), {
      status: filters.status,
      employeeId: filters.employeeId || undefined,
      branchId: filters.branchId || undefined,
      createdAt: this.dateRange(filters.from, filters.to),
      OR: filters.q
        ? [
            { folio: { contains: filters.q, mode: "insensitive" } },
            { title: { contains: filters.q, mode: "insensitive" } },
            { description: { contains: filters.q, mode: "insensitive" } },
            { employee: { fullName: { contains: filters.q, mode: "insensitive" } } }
          ]
        : undefined
    })
  }

  private scopeForUser(user: AuthUser): Prisma.IncidentWhereInput {
    if (user.role === Role.ENCARGADO) return { branchId: user.branchId ?? "__none__" }
    return {}
  }

  private andWhere(...clauses: Prisma.IncidentWhereInput[]): Prisma.IncidentWhereInput {
    const effective = clauses.map((clause) => this.definedWhere(clause)).filter((clause) => Object.keys(clause).length > 0)
    if (effective.length === 0) return {}
    if (effective.length === 1) return effective[0]
    return { AND: effective }
  }

  private definedWhere(where: Prisma.IncidentWhereInput): Prisma.IncidentWhereInput {
    const defined: Prisma.IncidentWhereInput = {}
    for (const [key, value] of Object.entries(where)) {
      if (value !== undefined) {
        ;(defined as Record<string, unknown>)[key] = value
      }
    }
    return defined
  }

  private dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) return undefined
    return {
      ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59`) } : {})
    }
  }

  private includeSummary() {
    return {
      employee: { include: { branch: true } },
      branch: true,
      reportedByUser: { select: { id: true, fullName: true, role: true } },
      messages: {
        include: { author: { select: { id: true, fullName: true, role: true } } },
        orderBy: { createdAt: "asc" }
      }
    } satisfies Prisma.IncidentInclude
  }

  private includeDetail() {
    return this.includeSummary()
  }

  private async nextFolio() {
    const now = new Date()
    const prefix = `INC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`
    const count = await this.prisma.incident.count({
      where: {
        createdAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        }
      }
    })
    return `${prefix}-${String(count + 1).padStart(4, "0")}`
  }

  private toFileResponse(asset: {
    id: string
    bucket: string
    key: string
    originalName: string
    mimeType: string
    size: number
    module: FileAssetModule
    entityId: string | null
    branchId: string | null
    createdAt: Date
  }) {
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
