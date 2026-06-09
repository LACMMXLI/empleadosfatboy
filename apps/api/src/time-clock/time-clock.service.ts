import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common"
import {
  AuditAction,
  MovementKind,
  Prisma,
  Role,
  TimeClockEntryStatus,
  TimeClockEventType,
  WorkSessionStatus
} from "@prisma/client"
import bcrypt from "bcryptjs"
import { createHash, randomBytes } from "crypto"
import { AuditService } from "../audit/audit.service"
import type { AuthUser } from "../auth/auth.types"
import { FilesService } from "../files/files.service"
import { PrismaService } from "../prisma/prisma.service"

type RequestMetadata = {
  ipAddress?: string
  userAgent?: string
}

type CreateDeviceInput = {
  name: string
  branchId: string
}

type UpdateDeviceInput = {
  name?: string
  branchId?: string
  active?: boolean
  rotateToken?: boolean
}

type RegisterEntryInput = {
  employeeId: string
  type: TimeClockEventType
  pin: string
}

type AttendanceFilters = {
  date?: string
  branchId?: string
  employeeId?: string
}

type ManualAdjustmentInput = {
  employeeId: string
  branchId?: string
  type: TimeClockEventType
  occurredAt?: string
  reason: string
  notes?: string
}

const timeZone = "America/Tijuana"
const movementKindsThatRequireActiveShift = new Set<MovementKind>([
  MovementKind.SALARY_ADVANCE,
  MovementKind.ADMIN_SALARY_ADVANCE,
  MovementKind.DRINK,
  MovementKind.INTERNAL_CONSUMPTION,
  MovementKind.FOOD
])

@Injectable()
export class TimeClockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService
  ) {}

  async listDevices(user: AuthUser) {
    const devices = await this.prisma.timeClockDevice.findMany({
      where: this.deviceScope(user),
      include: {
        branch: true,
        createdBy: { select: { id: true, fullName: true, role: true } }
      },
      orderBy: { createdAt: "desc" }
    })

    return devices.map(({ tokenHash, ...device }) => device)
  }

  async createDevice(input: CreateDeviceInput, user: AuthUser, ipAddress?: string) {
    const name = input.name.trim()
    if (name.length < 2) throw new BadRequestException("Nombre de dispositivo requerido")

    const branch = await this.resolveBranchForAdmin(input.branchId, user)
    const token = this.generateDeviceToken()
    const device = await this.prisma.timeClockDevice.create({
      data: {
        name,
        branchId: branch.id,
        tokenHash: this.hashDeviceToken(token),
        tokenLast4: token.slice(-4),
        createdById: user.sub
      },
      include: { branch: true }
    })

    await this.audit.log({
      userId: user.sub,
      action: AuditAction.CREATE,
      entity: "TimeClockDevice",
      entityId: device.id,
      newValue: this.toJson({ id: device.id, name: device.name, branchId: device.branchId, active: device.active }),
      ipAddress
    })

    const { tokenHash, ...safeDevice } = device
    return { ...safeDevice, setupToken: token }
  }

  async updateDevice(id: string, input: UpdateDeviceInput, user: AuthUser, ipAddress?: string) {
    const before = await this.findVisibleDevice(id, user)
    const data: Prisma.TimeClockDeviceUpdateInput = {}
    let setupToken: string | undefined

    if (input.name !== undefined) {
      const name = input.name.trim()
      if (name.length < 2) throw new BadRequestException("Nombre de dispositivo requerido")
      data.name = name
    }
    if (input.branchId !== undefined) {
      const branch = await this.resolveBranchForAdmin(input.branchId, user)
      data.branch = { connect: { id: branch.id } }
    }
    if (input.active !== undefined) data.active = input.active
    if (input.rotateToken) {
      setupToken = this.generateDeviceToken()
      data.tokenHash = this.hashDeviceToken(setupToken)
      data.tokenLast4 = setupToken.slice(-4)
    }

    const updated = await this.prisma.timeClockDevice.update({
      where: { id },
      data,
      include: { branch: true, createdBy: { select: { id: true, fullName: true, role: true } } }
    })

    await this.audit.log({
      userId: user.sub,
      action: AuditAction.UPDATE,
      entity: "TimeClockDevice",
      entityId: id,
      oldValue: this.toJson(this.safeDevice(before)),
      newValue: this.toJson({ ...this.safeDevice(updated), tokenRotated: Boolean(input.rotateToken) }),
      ipAddress
    })

    const { tokenHash, ...safeDevice } = updated
    return setupToken ? { ...safeDevice, setupToken } : safeDevice
  }

  async publicDevice(token: string | undefined) {
    const device = await this.validateDeviceToken(token)
    return {
      id: device.id,
      name: device.name,
      branch: device.branch
    }
  }

  async publicEmployees(token: string | undefined) {
    const device = await this.validateDeviceToken(token)
    return this.prisma.employee.findMany({
      where: { branchId: device.branchId, active: true },
      select: { id: true, fullName: true, position: true },
      orderBy: { fullName: "asc" }
    })
  }

  async registerEntry(
    token: string | undefined,
    input: RegisterEntryInput,
    photo: Express.Multer.File | undefined,
    metadata: RequestMetadata
  ) {
    if (!photo) throw new BadRequestException("La foto es obligatoria")
    if (!/^\d{6}$/.test(input.pin)) throw new BadRequestException("PIN invalido")

    const device = await this.validateDeviceToken(token)
    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, branchId: device.branchId, active: true },
      include: { branch: true }
    })
    if (!employee) throw new NotFoundException("Empleado no encontrado o fuera de sucursal")

    const validPin = await bcrypt.compare(input.pin, employee.pinHash)
    if (!validPin) throw new BadRequestException("PIN del empleado invalido")

    const now = new Date()
    const local = this.localParts(now)

    await this.assertEntryAllowed(employee.id, input.type)
    const evidence = await this.files.uploadTimeClockEvidence(photo, employee.branchId, metadata.ipAddress)

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const entry = await tx.timeClockEntry.create({
          data: {
            employeeId: employee.id,
            branchId: employee.branchId,
            deviceId: device.id,
            type: input.type,
            occurredAt: now,
            localDate: local.localDate,
            localTime: local.localTime,
            timeZone,
            evidenceFileId: evidence.id,
            status: TimeClockEntryStatus.VALID,
            requestIp: metadata.ipAddress,
            requestUserAgent: metadata.userAgent
          },
          include: this.entryInclude()
        })

        await tx.fileAsset.update({
          where: { id: evidence.id },
          data: { entityId: entry.id }
        })

        let session
        if (input.type === TimeClockEventType.ENTRY) {
          session = await tx.workSession.create({
            data: {
              employeeId: employee.id,
              branchId: employee.branchId,
              deviceId: device.id,
              startEntryId: entry.id,
              startedAt: now,
              localDate: local.localDate,
              timeZone,
              status: WorkSessionStatus.ACTIVE
            }
          })
        } else {
          const activeSession = await tx.workSession.findFirst({
            where: { employeeId: employee.id, status: WorkSessionStatus.ACTIVE },
            orderBy: { startedAt: "desc" }
          })
          if (!activeSession) throw new BadRequestException("No existe entrada activa para registrar salida")
          session = await tx.workSession.update({
            where: { id: activeSession.id },
            data: {
              endEntryId: entry.id,
              endedAt: now,
              status: WorkSessionStatus.CLOSED,
              totalMinutes: this.minutesBetween(activeSession.startedAt, now)
            }
          })
        }

        await tx.auditLog.create({
          data: {
            action: AuditAction.CREATE,
            entity: "TimeClockEntry",
            entityId: entry.id,
            affectedEmployeeId: employee.id,
            newValue: this.toJson({ entryId: entry.id, sessionId: session.id, type: input.type, deviceId: device.id }),
            ipAddress: metadata.ipAddress
          }
        })

        return { entry, session }
      })

      return {
        ok: true,
        message: input.type === TimeClockEventType.ENTRY ? "Entrada registrada" : "Salida registrada",
        entry: result.entry,
        session: result.session
      }
    } catch (error) {
      await this.files.deleteStoredObject(evidence.key)
      throw error
    }
  }

  async attendance(filters: AttendanceFilters, user: AuthUser) {
    const date = filters.date || this.localParts(new Date()).localDate
    const branchId = this.effectiveBranchFilter(filters.branchId, user)
    const employeeWhere = this.definedEmployeeWhere({
      id: filters.employeeId,
      branchId,
      active: true
    })

    const [employees, entries, sessions] = await Promise.all([
      this.prisma.employee.findMany({
        where: employeeWhere,
        include: { branch: true },
        orderBy: { fullName: "asc" }
      }),
      this.prisma.timeClockEntry.findMany({
        where: this.entryScope({ localDate: date, branchId, employeeId: filters.employeeId }, user),
        include: this.entryInclude(),
        orderBy: { occurredAt: "asc" }
      }),
      this.prisma.workSession.findMany({
        where: this.sessionScope({ localDate: date, branchId, employeeId: filters.employeeId }, user),
        include: {
          startEntry: true,
          endEntry: true
        },
        orderBy: { startedAt: "asc" }
      })
    ])

    const entriesByEmployee = this.groupBy(entries, (entry) => entry.employeeId)
    const sessionsByEmployee = this.groupBy(sessions, (session) => session.employeeId)

    return employees.map((employee) => {
      const employeeEntries = entriesByEmployee.get(employee.id) ?? []
      const employeeSessions = sessionsByEmployee.get(employee.id) ?? []
      const activeSession = employeeSessions.find((session) => session.status === WorkSessionStatus.ACTIVE)
      const lastEntry = employeeEntries[employeeEntries.length - 1]
      const status = activeSession
        ? "IN_SHIFT"
        : lastEntry?.type === TimeClockEventType.EXIT
          ? "EXITED"
          : "NO_SHOW"

      return {
        employee,
        branch: employee.branch,
        date,
        status,
        activeSession,
        lastEntry,
        entries: employeeEntries,
        sessions: employeeSessions
      }
    })
  }

  async employeeHistory(employeeId: string, filters: { from?: string; to?: string }, user: AuthUser) {
    await this.ensureEmployeeVisible(employeeId, user)
    return this.prisma.timeClockEntry.findMany({
      where: this.entryScope({
        employeeId,
        localDate: filters.from || filters.to ? undefined : undefined,
        localDateRange: this.localDateRange(filters.from, filters.to)
      }, user),
      include: this.entryInclude(),
      orderBy: { occurredAt: "desc" },
      take: 200
    })
  }

  async adjustments(filters: { employeeId?: string; branchId?: string }, user: AuthUser) {
    return this.prisma.attendanceAdjustment.findMany({
      where: this.adjustmentScope(filters, user),
      include: {
        employee: { include: { branch: true } },
        branch: true,
        adjustedBy: { select: { id: true, fullName: true, role: true } },
        entry: true,
        workSession: true
      },
      orderBy: { createdAt: "desc" },
      take: 100
    })
  }

  async createManualAdjustment(input: ManualAdjustmentInput, user: AuthUser, ipAddress?: string) {
    const reason = input.reason.trim()
    if (reason.length < 5) throw new BadRequestException("Motivo obligatorio de al menos 5 caracteres")

    const employee = await this.resolveEmployeeForAdmin(input.employeeId, input.branchId, user)
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date()
    if (Number.isNaN(occurredAt.getTime())) throw new BadRequestException("Fecha/hora invalida")
    const local = this.localParts(occurredAt)

    const result = await this.prisma.$transaction(async (tx) => {
      if (input.type === TimeClockEventType.ENTRY) {
        const activeSession = await tx.workSession.findFirst({
          where: { employeeId: employee.id, status: WorkSessionStatus.ACTIVE },
          orderBy: { startedAt: "desc" }
        })
        if (activeSession) throw new BadRequestException("El empleado ya tiene una jornada activa")
      }

      if (input.type === TimeClockEventType.EXIT) {
        const activeSession = await tx.workSession.findFirst({
          where: { employeeId: employee.id, status: WorkSessionStatus.ACTIVE },
          orderBy: { startedAt: "desc" }
        })
        if (!activeSession) throw new BadRequestException("No existe entrada activa para registrar salida manual")
      }

      const entry = await tx.timeClockEntry.create({
        data: {
          employeeId: employee.id,
          branchId: employee.branchId,
          type: input.type,
          occurredAt,
          localDate: local.localDate,
          localTime: local.localTime,
          timeZone,
          status: TimeClockEntryStatus.MANUAL,
          notes: input.notes?.trim() || undefined,
          createdByUserId: user.sub
        }
      })

      let session
      let oldValue: Prisma.InputJsonValue | undefined
      if (input.type === TimeClockEventType.ENTRY) {
        session = await tx.workSession.create({
          data: {
            employeeId: employee.id,
            branchId: employee.branchId,
            startEntryId: entry.id,
            startedAt: occurredAt,
            localDate: local.localDate,
            timeZone,
            status: WorkSessionStatus.ACTIVE,
            notes: input.notes?.trim() || undefined
          }
        })
      } else {
        const activeSession = await tx.workSession.findFirstOrThrow({
          where: { employeeId: employee.id, status: WorkSessionStatus.ACTIVE },
          orderBy: { startedAt: "desc" }
        })
        oldValue = this.toJson(activeSession)
        session = await tx.workSession.update({
          where: { id: activeSession.id },
          data: {
            endEntryId: entry.id,
            endedAt: occurredAt,
            status: WorkSessionStatus.ADJUSTED,
            totalMinutes: this.minutesBetween(activeSession.startedAt, occurredAt),
            notes: input.notes?.trim() || activeSession.notes
          }
        })
      }

      const adjustment = await tx.attendanceAdjustment.create({
        data: {
          employeeId: employee.id,
          branchId: employee.branchId,
          entryId: entry.id,
          workSessionId: session.id,
          action: `MANUAL_${input.type}`,
          reason,
          oldValue,
          newValue: this.toJson({ entry, session }),
          adjustedById: user.sub,
          ipAddress
        }
      })

      await tx.auditLog.create({
        data: {
          userId: user.sub,
          action: AuditAction.UPDATE,
          entity: "AttendanceAdjustment",
          entityId: adjustment.id,
          affectedEmployeeId: employee.id,
          oldValue,
          newValue: this.toJson({ entryId: entry.id, sessionId: session.id, reason }),
          ipAddress
        }
      })

      return { entry, session, adjustment }
    })

    return result
  }

  async exportAttendance(filters: AttendanceFilters, user: AuthUser) {
    const rows = await this.attendance(filters, user)
    const header = ["Fecha", "Sucursal", "Empleado", "Puesto", "Estado", "Ultima checada", "Entrada", "Salida", "Minutos"].join(",")
    const lines = rows.map((row) => {
      const session = row.sessions[row.sessions.length - 1]
      return [
        row.date,
        row.branch.name,
        row.employee.fullName,
        row.employee.position,
        this.statusLabel(row.status),
        row.lastEntry ? `${row.lastEntry.localTime} ${row.lastEntry.type}` : "",
        session?.startEntry?.localTime ?? "",
        session?.endEntry?.localTime ?? "",
        session?.totalMinutes ?? ""
      ].map((value) => this.csvValue(value)).join(",")
    })
    return `\uFEFF${header}\n${lines.join("\n")}`
  }

  async ensureEmployeeHasActiveShiftToday(
    employeeId: string,
    kind: MovementKind,
    metadata: RequestMetadata & { userId?: string; device?: string; context?: string }
  ) {
    if (!movementKindsThatRequireActiveShift.has(kind)) return

    const today = this.localParts(new Date()).localDate
    const active = await this.prisma.workSession.findFirst({
      where: {
        employeeId,
        localDate: today,
        status: WorkSessionStatus.ACTIVE
      },
      select: { id: true }
    })

    if (active) return

    await this.audit.log({
      userId: metadata.userId,
      action: AuditAction.BLOCKED,
      entity: "Movement",
      affectedEmployeeId: employeeId,
      newValue: this.toJson({
        reason: "NO_ACTIVE_SHIFT",
        kind,
        date: today,
        context: metadata.context,
        device: metadata.device,
        userAgent: metadata.userAgent
      }),
      ipAddress: metadata.ipAddress
    })
    throw new ForbiddenException("El empleado no tiene turno activo registrado.")
  }

  private async assertEntryAllowed(employeeId: string, type: TimeClockEventType) {
    const activeSession = await this.prisma.workSession.findFirst({
      where: { employeeId, status: WorkSessionStatus.ACTIVE },
      select: { id: true }
    })

    if (type === TimeClockEventType.ENTRY && activeSession) {
      throw new BadRequestException("El empleado ya tiene una entrada activa")
    }
    if (type === TimeClockEventType.EXIT && !activeSession) {
      throw new BadRequestException("No existe entrada activa para registrar salida")
    }
  }

  private async validateDeviceToken(token: string | undefined) {
    const cleanToken = token?.trim()
    if (!cleanToken) throw new UnauthorizedException("Dispositivo no registrado")

    const device = await this.prisma.timeClockDevice.findUnique({
      where: { tokenHash: this.hashDeviceToken(cleanToken) },
      include: { branch: true }
    })
    if (!device?.active || !device.branch.active) throw new UnauthorizedException("Dispositivo no autorizado")
    return device
  }

  private async findVisibleDevice(id: string, user: AuthUser) {
    const device = await this.prisma.timeClockDevice.findFirst({
      where: { id, ...this.deviceScope(user) },
      include: { branch: true, createdBy: { select: { id: true, fullName: true, role: true } } }
    })
    if (!device) throw new NotFoundException("Dispositivo no encontrado")
    return device
  }

  private async resolveBranchForAdmin(branchId: string, user: AuthUser) {
    if (!branchId) throw new BadRequestException("Sucursal requerida")
    if (user.role === Role.ENCARGADO && user.branchId !== branchId) {
      throw new ForbiddenException("No puedes administrar otra sucursal")
    }

    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, active: true }, select: { id: true } })
    if (!branch) throw new NotFoundException("Sucursal no encontrada")
    return branch
  }

  private async resolveEmployeeForAdmin(employeeId: string, branchId: string | undefined, user: AuthUser) {
    const effectiveBranchId = this.effectiveBranchFilter(branchId, user)
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        active: true,
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {})
      },
      include: { branch: true }
    })
    if (!employee) throw new NotFoundException("Empleado no encontrado o fuera de alcance")
    return employee
  }

  private async ensureEmployeeVisible(employeeId: string, user: AuthUser) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        ...(user.role === Role.ENCARGADO ? { branchId: user.branchId ?? "__none__" } : {})
      },
      select: { id: true }
    })
    if (!employee) throw new NotFoundException("Empleado no encontrado o fuera de alcance")
  }

  private deviceScope(user: AuthUser): Prisma.TimeClockDeviceWhereInput {
    if (user.role === Role.ENCARGADO) return { branchId: user.branchId ?? "__none__" }
    return {}
  }

  private entryScope(
    filters: { localDate?: string; localDateRange?: Prisma.StringFilter; branchId?: string; employeeId?: string },
    user: AuthUser
  ): Prisma.TimeClockEntryWhereInput {
    return this.definedEntryWhere({
      localDate: filters.localDateRange ?? filters.localDate,
      branchId: this.effectiveBranchFilter(filters.branchId, user),
      employeeId: filters.employeeId
    })
  }

  private sessionScope(
    filters: { localDate?: string; branchId?: string; employeeId?: string },
    user: AuthUser
  ): Prisma.WorkSessionWhereInput {
    return this.definedSessionWhere({
      localDate: filters.localDate,
      branchId: this.effectiveBranchFilter(filters.branchId, user),
      employeeId: filters.employeeId
    })
  }

  private adjustmentScope(filters: { employeeId?: string; branchId?: string }, user: AuthUser): Prisma.AttendanceAdjustmentWhereInput {
    return this.definedAdjustmentWhere({
      employeeId: filters.employeeId,
      branchId: this.effectiveBranchFilter(filters.branchId, user)
    })
  }

  private effectiveBranchFilter(branchId: string | undefined, user: AuthUser) {
    if (user.role === Role.ENCARGADO) return user.branchId ?? "__none__"
    return branchId || undefined
  }

  private entryInclude() {
    return {
      employee: { include: { branch: true } },
      branch: true,
      device: { select: { id: true, name: true, tokenLast4: true, active: true } },
      evidenceFile: true,
      createdByUser: { select: { id: true, fullName: true, role: true } }
    } satisfies Prisma.TimeClockEntryInclude
  }

  private localParts(date: Date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date)
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00"
    return {
      localDate: `${get("year")}-${get("month")}-${get("day")}`,
      localTime: `${get("hour")}:${get("minute")}:${get("second")}`
    }
  }

  private localDateRange(from?: string, to?: string): Prisma.StringFilter | undefined {
    if (!from && !to) return undefined
    return {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {})
    }
  }

  private generateDeviceToken() {
    return randomBytes(32).toString("base64url")
  }

  private hashDeviceToken(token: string) {
    return createHash("sha256").update(token.trim()).digest("hex")
  }

  private minutesBetween(start: Date, end: Date) {
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000))
  }

  private groupBy<T>(items: T[], getKey: (item: T) => string) {
    const grouped = new Map<string, T[]>()
    for (const item of items) {
      const key = getKey(item)
      const list = grouped.get(key) ?? []
      list.push(item)
      grouped.set(key, list)
    }
    return grouped
  }

  private statusLabel(status: string) {
    if (status === "IN_SHIFT") return "En turno"
    if (status === "EXITED") return "Salio"
    return "Sin checar"
  }

  private csvValue(value: unknown) {
    const text = String(value ?? "")
    return `"${text.replace(/"/g, "\"\"")}"`
  }

  private safeDevice(device: { tokenHash?: string } & Record<string, unknown>) {
    const { tokenHash, ...safe } = device
    return safe
  }

  private definedEmployeeWhere(where: Prisma.EmployeeWhereInput): Prisma.EmployeeWhereInput {
    return this.defined(where) as Prisma.EmployeeWhereInput
  }

  private definedEntryWhere(where: Prisma.TimeClockEntryWhereInput): Prisma.TimeClockEntryWhereInput {
    return this.defined(where) as Prisma.TimeClockEntryWhereInput
  }

  private definedSessionWhere(where: Prisma.WorkSessionWhereInput): Prisma.WorkSessionWhereInput {
    return this.defined(where) as Prisma.WorkSessionWhereInput
  }

  private definedAdjustmentWhere(where: Prisma.AttendanceAdjustmentWhereInput): Prisma.AttendanceAdjustmentWhereInput {
    return this.defined(where) as Prisma.AttendanceAdjustmentWhereInput
  }

  private defined(where: Record<string, unknown>) {
    const defined: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(where)) {
      if (value !== undefined) defined[key] = value
    }
    return defined
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
  }
}
