import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import {
  AuditAction,
  MovementKind,
  MovementOrigin,
  MovementStatus,
  OvertimeAuthorizationStatus,
  Prisma,
  Role,
  TimeClockDeviceRequestStatus,
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
import { LoginThrottleService } from "../security/login-throttle.service"
import { calculateAttendance, scheduleDayNames, type ScheduleRecord } from "./attendance-calculation"

type RequestMetadata = {
  ipAddress?: string
  userAgent?: string
}

type CreateDeviceInput = {
  name: string
  branchId: string
}

type CreateDeviceRegistrationInput = {
  requestToken: string
}

type ApproveDeviceRegistrationInput = {
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
  employeeCode: string
  type: TimeClockEventType
}

type RegisterDrinkInput = {
  employeeCode: string
}

type VerifyEmployeeCodeInput = {
  employeeCode: string
}

type AttendanceFilters = {
  date?: string
  branchId?: string
  employeeId?: string
}

type HistoryFilters = {
  from?: string
  to?: string
}

type ManualAdjustmentInput = {
  employeeId: string
  branchId?: string
  type: TimeClockEventType
  occurredAt?: string
  reason: string
  notes?: string
}

type WorkScheduleInput = {
  days: Array<{ dayOfWeek: number; enabled: boolean; start: string; end: string }>
  lateGraceMinutes: number
  overtimeThresholdMinutes: number
}

type DecideOvertimeInput = {
  status: OvertimeAuthorizationStatus
  authorizedMinutes?: number
  notes?: string
}

const timeZone = "America/Tijuana"
const deviceRequestMinutes = 30
const minimumTimeClockGapMs = 2 * 60 * 1000
const minimumDrinkGapMs = 2 * 60 * 1000
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
    private readonly files: FilesService,
    private readonly loginThrottle: LoginThrottleService,
    private readonly config: ConfigService
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

  async listDeviceRequests(user: AuthUser) {
    await this.expireOldDeviceRequests()
    return this.prisma.timeClockDeviceRequest.findMany({
      where: {
        status: TimeClockDeviceRequestStatus.PENDING,
        expiresAt: { gt: new Date() }
      },
      include: {
        branch: true,
        authorizedBy: { select: { id: true, fullName: true, role: true } },
        authorizedDevice: { include: { branch: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 30
    })
  }

  async createDeviceRegistration(input: CreateDeviceRegistrationInput, metadata: RequestMetadata) {
    const requestToken = input.requestToken.trim()
    if (!this.isValidDeviceToken(requestToken)) {
      throw new BadRequestException("Identificador de dispositivo invalido")
    }

    const requestTokenHash = this.hashDeviceToken(requestToken)
    const existingDevice = await this.prisma.timeClockDevice.findUnique({
      where: { tokenHash: requestTokenHash },
      include: { branch: true }
    })
    if (existingDevice?.active && existingDevice.branch.active) {
      return {
        status: TimeClockDeviceRequestStatus.AUTHORIZED,
        device: {
          id: existingDevice.id,
          name: existingDevice.name,
          branch: existingDevice.branch
        }
      }
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + deviceRequestMinutes * 60_000)
    const existing = await this.prisma.timeClockDeviceRequest.findUnique({
      where: { requestTokenHash },
      include: { authorizedDevice: { include: { branch: true } } }
    })

    if (existing?.status === TimeClockDeviceRequestStatus.AUTHORIZED && existing.authorizedDevice?.active) {
      return {
        id: existing.id,
        code: existing.code,
        status: existing.status,
        expiresAt: existing.expiresAt,
        device: {
          id: existing.authorizedDevice.id,
          name: existing.authorizedDevice.name,
          branch: existing.authorizedDevice.branch
        }
      }
    }

    if (existing?.status === TimeClockDeviceRequestStatus.PENDING && existing.expiresAt > now) {
      return {
        id: existing.id,
        code: existing.code,
        status: existing.status,
        expiresAt: existing.expiresAt
      }
    }

    const code = await this.nextDeviceRequestCode()
    const data = {
      code,
      requestTokenHash,
      requestTokenLast4: requestToken.slice(-4),
      status: TimeClockDeviceRequestStatus.PENDING,
      requestIp: metadata.ipAddress,
      requestUserAgent: metadata.userAgent,
      expiresAt
    }

    const request = existing
      ? await this.prisma.timeClockDeviceRequest.update({
          where: { id: existing.id },
          data
        })
      : await this.prisma.timeClockDeviceRequest.create({
          data
        })

    await this.audit.log({
      action: AuditAction.CREATE,
      entity: "TimeClockDeviceRequest",
      entityId: request.id,
      newValue: this.toJson({ code: request.code, status: request.status, tokenLast4: request.requestTokenLast4 }),
      ipAddress: metadata.ipAddress
    })

    return {
      id: request.id,
      code: request.code,
      status: request.status,
      expiresAt: request.expiresAt
    }
  }

  async approveDeviceRegistration(id: string, input: ApproveDeviceRegistrationInput, user: AuthUser, ipAddress?: string) {
    const name = input.name.trim()
    if (name.length < 2) throw new BadRequestException("Nombre de dispositivo requerido")
    const branch = await this.resolveBranchForAdmin(input.branchId, user)

    const request = await this.prisma.timeClockDeviceRequest.findUnique({ where: { id } })
    if (!request) throw new NotFoundException("Solicitud de dispositivo no encontrada")
    if (request.status !== TimeClockDeviceRequestStatus.PENDING || request.expiresAt <= new Date()) {
      throw new BadRequestException("La solicitud ya no esta pendiente")
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const device = await tx.timeClockDevice.create({
        data: {
          name,
          branchId: branch.id,
          tokenHash: request.requestTokenHash,
          tokenLast4: request.requestTokenLast4,
          createdById: user.sub
        },
        include: { branch: true }
      })

      const updatedRequest = await tx.timeClockDeviceRequest.update({
        where: { id: request.id },
        data: {
          status: TimeClockDeviceRequestStatus.AUTHORIZED,
          branchId: branch.id,
          deviceName: name,
          authorizedDeviceId: device.id,
          authorizedById: user.sub
        },
        include: {
          branch: true,
          authorizedBy: { select: { id: true, fullName: true, role: true } },
          authorizedDevice: { include: { branch: true } }
        }
      })

      await tx.auditLog.create({
        data: {
          userId: user.sub,
          action: AuditAction.CREATE,
          entity: "TimeClockDevice",
          entityId: device.id,
          newValue: this.toJson({
            deviceId: device.id,
            requestId: request.id,
            requestCode: request.code,
            branchId: branch.id
          }),
          ipAddress
        }
      })

      return { device, request: updatedRequest }
    })

    const { tokenHash, ...safeDevice } = result.device
    return { ...result.request, authorizedDevice: safeDevice }
  }

  async rejectDeviceRegistration(id: string, user: AuthUser, ipAddress?: string) {
    const request = await this.prisma.timeClockDeviceRequest.findUnique({ where: { id } })
    if (!request) throw new NotFoundException("Solicitud de dispositivo no encontrada")
    if (request.status !== TimeClockDeviceRequestStatus.PENDING) return request

    const updated = await this.prisma.timeClockDeviceRequest.update({
      where: { id },
      data: {
        status: TimeClockDeviceRequestStatus.REJECTED,
        authorizedById: user.sub
      }
    })

    await this.audit.log({
      userId: user.sub,
      action: AuditAction.UPDATE,
      entity: "TimeClockDeviceRequest",
      entityId: id,
      oldValue: this.toJson({ status: request.status, code: request.code }),
      newValue: this.toJson({ status: updated.status, code: updated.code }),
      ipAddress
    })

    return updated
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

  async purgeDeviceForDeveloper(id: string, user: AuthUser, ipAddress?: string) {
    if (!this.isDeveloperMaintenanceEnabled()) {
      throw new ForbiddenException("Mantenimiento de desarrollador deshabilitado")
    }

    const before = await this.findVisibleDevice(id, user)

    return this.prisma.$transaction(async (tx) => {
      const entries = await tx.timeClockEntry.updateMany({
        where: { deviceId: id },
        data: { deviceId: null }
      })
      const sessions = await tx.workSession.updateMany({
        where: { deviceId: id },
        data: { deviceId: null }
      })
      const requests = await tx.timeClockDeviceRequest.updateMany({
        where: { authorizedDeviceId: id },
        data: { authorizedDeviceId: null }
      })

      await tx.timeClockDevice.delete({ where: { id } })

      const summary = {
        deviceId: id,
        deviceDeleted: true,
        entriesDetached: entries.count,
        sessionsDetached: sessions.count,
        requestsDetached: requests.count
      }

      await tx.auditLog.create({
        data: {
          userId: user.sub,
          action: AuditAction.DELETE,
          entity: "DeveloperTimeClockDevicePurge",
          entityId: id,
          oldValue: this.toJson(this.safeDevice(before)),
          newValue: this.toJson(summary),
          ipAddress
        }
      })

      return summary
    })
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

  async verifyEmployeeCode(token: string | undefined, input: VerifyEmployeeCodeInput, metadata: RequestMetadata) {
    const device = await this.validateDeviceToken(token)
    const employeeCode = this.normalizeEmployeeCode(input.employeeCode)
    if (!employeeCode) throw new BadRequestException("Codigo de empleado requerido")

    const throttleId = this.timeClockThrottleIdentifier(device.id, employeeCode, metadata.ipAddress)
    await this.loginThrottle.assertCanAttempt("time-clock", throttleId)

    const employee = await this.findEmployeeByCode(device.branchId, employeeCode)
    if (!employee) {
      await this.loginThrottle.recordFailure("time-clock", throttleId, metadata)
      throw new BadRequestException("Codigo de empleado invalido")
    }

    await this.loginThrottle.recordSuccess("time-clock", throttleId)
    const [activeSession, lastEntry, recentMovements] = await Promise.all([
      this.prisma.workSession.findFirst({
        where: { employeeId: employee.id, status: WorkSessionStatus.ACTIVE },
        include: {
          startEntry: {
            select: {
              occurredAt: true,
              localDate: true,
              localTime: true,
              type: true
            }
          }
        },
        orderBy: { startedAt: "desc" }
      }),
      this.prisma.timeClockEntry.findFirst({
        where: {
          employeeId: employee.id,
          status: { in: [TimeClockEntryStatus.VALID, TimeClockEntryStatus.MANUAL] }
        },
        orderBy: { occurredAt: "desc" },
        select: {
          occurredAt: true,
          localDate: true,
          localTime: true,
          type: true
        }
      }),
      this.prisma.movement.findMany({
        where: {
          employeeId: employee.id,
          kind: {
            in: [
              MovementKind.SALARY_ADVANCE,
              MovementKind.ADMIN_SALARY_ADVANCE,
              MovementKind.LOAN,
              MovementKind.ADMIN_LOAN,
              MovementKind.INTERNAL_CONSUMPTION,
              MovementKind.DRINK,
              MovementKind.FOOD
            ]
          }
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          folio: true,
          kind: true,
          amount: true,
          reason: true,
          status: true,
          productName: true,
          createdAt: true
        }
      })
    ])
    const isOnBreak = Boolean(activeSession && lastEntry?.type === TimeClockEventType.BREAK_START)
    const attendanceState = isOnBreak ? "ON_BREAK" : activeSession ? "IN_SHIFT" : lastEntry?.type === TimeClockEventType.EXIT ? "EXITED" : "NO_RECORD"
    const allowedActions = !activeSession
      ? [TimeClockEventType.ENTRY]
      : isOnBreak
        ? [TimeClockEventType.BREAK_END]
        : [TimeClockEventType.EXIT, TimeClockEventType.BREAK_START]

    return {
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        position: employee.position,
        branch: {
          id: employee.branch.id,
          name: employee.branch.name,
          code: employee.branch.code
        }
      },
      attendance: {
        state: attendanceState,
        statusLabel: isOnBreak ? "En horario de comida" : activeSession ? "Jornada activa" : lastEntry?.type === TimeClockEventType.EXIT ? "Salida registrada" : "Sin entrada activa",
        nextAction: allowedActions[0],
        allowedActions,
        activeSession: activeSession
          ? {
              startedAt: activeSession.startedAt,
              localDate: activeSession.localDate,
              localTime: activeSession.startEntry.localTime
            }
          : null,
        lastEntry: lastEntry
          ? {
              type: lastEntry.type,
              occurredAt: lastEntry.occurredAt,
              localDate: lastEntry.localDate,
              localTime: lastEntry.localTime
            }
          : null
      },
      recentMovements: recentMovements.map((movement) => ({
        id: movement.id,
        folio: movement.folio,
        kind: movement.kind,
        amount: Number(movement.amount),
        reason: movement.reason,
        status: movement.status,
        productName: movement.productName,
        createdAt: movement.createdAt
      }))
    }
  }

  async authorizeSalaryAdvanceRequest(
    token: string | undefined,
    input: { employeeCode: string; approverCode: string },
    metadata: RequestMetadata
  ) {
    const device = await this.validateDeviceToken(token)
    const employeeCode = this.normalizeEmployeeCode(input.employeeCode)
    const approverCode = this.normalizeEmployeeCode(input.approverCode)
    if (employeeCode.length !== 6) throw new BadRequestException("Codigo de empleado invalido")
    if (approverCode.length !== 6) throw new BadRequestException("Codigo del encargado invalido")

    const employeeThrottleId = this.timeClockThrottleIdentifier(device.id, employeeCode, metadata.ipAddress)
    await this.loginThrottle.assertCanAttempt("time-clock", employeeThrottleId)
    const employee = await this.findEmployeeByCode(device.branchId, employeeCode)
    if (!employee) {
      await this.loginThrottle.recordFailure("time-clock", employeeThrottleId, metadata)
      throw new BadRequestException("Codigo de empleado invalido")
    }
    await this.loginThrottle.recordSuccess("time-clock", employeeThrottleId)

    const approverThrottleId = `${device.id}:${metadata.ipAddress?.trim() || "unknown-ip"}`
    await this.loginThrottle.assertCanAttempt("time-clock-advance-approver", approverThrottleId)
    const approvers = await this.prisma.user.findMany({
      where: {
        branchId: device.branchId,
        role: Role.ENCARGADO,
        active: true,
        approvalPinHash: { not: null }
      },
      select: { id: true, fullName: true, role: true, branchId: true, approvalPinHash: true }
    })
    if (!approvers.length) {
      throw new BadRequestException("La sucursal no tiene un encargado con codigo de aprobacion configurado")
    }

    let approver: (typeof approvers)[number] | undefined
    for (const candidate of approvers) {
      if (candidate.approvalPinHash && await bcrypt.compare(approverCode, candidate.approvalPinHash)) {
        approver = candidate
        break
      }
    }
    if (!approver) {
      await this.loginThrottle.recordFailure("time-clock-advance-approver", approverThrottleId, metadata)
      await this.audit.log({
        action: AuditAction.BLOCKED,
        entity: "Movement",
        affectedEmployeeId: employee.id,
        newValue: this.toJson({
          reason: "INVALID_BRANCH_MANAGER_APPROVAL_CODE",
          source: "time-clock-salary-advance",
          deviceId: device.id,
          branchId: device.branchId
        }),
        ipAddress: metadata.ipAddress
      })
      throw new BadRequestException("Codigo del encargado invalido")
    }
    await this.loginThrottle.recordSuccess("time-clock-advance-approver", approverThrottleId)

    const { approvalPinHash, ...safeApprover } = approver
    void approvalPinHash
    return { device, employee, approver: safeApprover }
  }

  async registerEntry(
    token: string | undefined,
    input: RegisterEntryInput,
    photo: Express.Multer.File | undefined,
    metadata: RequestMetadata
  ) {
    if (!photo) throw new BadRequestException("La foto es obligatoria")

    const device = await this.validateDeviceToken(token)
    const employeeCode = this.normalizeEmployeeCode(input.employeeCode)
    if (!employeeCode) throw new BadRequestException("Codigo de empleado requerido")

    const throttleId = this.timeClockThrottleIdentifier(device.id, employeeCode, metadata.ipAddress)
    await this.loginThrottle.assertCanAttempt("time-clock", throttleId)

    const employee = await this.findEmployeeByCode(device.branchId, employeeCode)
    if (!employee) {
      await this.loginThrottle.recordFailure("time-clock", throttleId, metadata)
      throw new BadRequestException("Codigo de empleado invalido")
    }

    await this.loginThrottle.recordSuccess("time-clock", throttleId)

    const now = new Date()
    const local = this.localParts(now)

    await this.assertEntryAllowed(employee.id, input.type)
    await this.assertMinimumGap(employee.id, now)
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
        } else if (input.type === TimeClockEventType.EXIT) {
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
        } else {
          session = await tx.workSession.findFirstOrThrow({
            where: { employeeId: employee.id, status: WorkSessionStatus.ACTIVE },
            orderBy: { startedAt: "desc" }
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
        message: this.timeClockEventLabel(input.type),
        entry: result.entry,
        session: result.session
      }
    } catch (error) {
      await this.files.deleteStoredObject(evidence.key)
      throw error
    }
  }

  async registerDrink(
    token: string | undefined,
    input: RegisterDrinkInput,
    photo: Express.Multer.File | undefined,
    metadata: RequestMetadata
  ) {
    const device = await this.validateDeviceToken(token)
    if (!photo) throw new BadRequestException("La foto es obligatoria")
    const employeeCode = this.normalizeEmployeeCode(input.employeeCode)
    if (!employeeCode) throw new BadRequestException("Codigo de empleado requerido")

    const throttleId = this.timeClockThrottleIdentifier(device.id, employeeCode, metadata.ipAddress)
    await this.loginThrottle.assertCanAttempt("time-clock", throttleId)

    const employee = await this.findEmployeeByCode(device.branchId, employeeCode)
    if (!employee) {
      await this.loginThrottle.recordFailure("time-clock", throttleId, metadata)
      throw new BadRequestException("Codigo de empleado invalido")
    }

    await this.loginThrottle.recordSuccess("time-clock", throttleId)

    await this.ensureEmployeeHasActiveShift(employee.id, MovementKind.DRINK, {
      ...metadata,
      device: `time-clock:${device.id}`,
      context: "time-clock-drink"
    })
    await this.assertDrinkGap(employee.id, device.id, new Date())

    const config = await this.prisma.systemConfig.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" }
    })
    const amount = Number(config.beveragePrice)
    const folio = await this.nextMovementFolio()
    const evidence = await this.files.uploadTimeClockEvidence(photo, employee.branchId, metadata.ipAddress)

    try {
      const movement = await this.prisma.movement.create({
        data: {
          folio,
          employeeId: employee.id,
          branchId: device.branchId,
          kind: MovementKind.DRINK,
          origin: MovementOrigin.EMPLOYEE_REQUEST,
          amount,
          reason: "Bebida",
          status: MovementStatus.AUTHORIZED,
          authorizedAt: new Date(),
          productName: "Bebida",
          quantity: 1,
          unitPrice: amount,
          receiptText: config.receiptLegalText,
          requestIp: metadata.ipAddress,
          requestUserAgent: metadata.userAgent,
          requestDevice: `time-clock:${device.id}`
        },
        include: {
          employee: { include: { branch: true } }
        }
      })
      const evidenceFile = await this.files.attachTimeClockEvidence(evidence.id, movement.id)

      await this.audit.log({
        action: AuditAction.CREATE,
        entity: "Movement",
        entityId: movement.id,
        affectedEmployeeId: employee.id,
        newValue: this.toJson({
          ...movement,
          evidenceFileId: evidenceFile.id,
          source: "time-clock-drink",
          deviceId: device.id
        }),
        ipAddress: metadata.ipAddress
      })

      return {
        ok: true,
        message: "Bebida registrada",
        amount,
        movement: {
          ...movement,
          evidenceFile
        },
        employee: {
          id: employee.id,
          fullName: employee.fullName,
          position: employee.position
        }
      }
    } catch (error) {
      await this.files.deleteStoredObject(evidence.key)
      throw error
    }
  }

  async employeeSchedule(employeeId: string, user: AuthUser) {
    const employee = await this.findVisibleEmployee(employeeId, user)
    const schedule = await this.prisma.employeeWorkSchedule.findUnique({ where: { employeeId } })
    return {
      employee,
      configured: Boolean(schedule),
      ...this.scheduleResponse(schedule)
    }
  }

  async updateEmployeeSchedule(employeeId: string, input: WorkScheduleInput, user: AuthUser, ipAddress?: string) {
    const employee = await this.findVisibleEmployee(employeeId, user)
    if (input.days.length !== 7 || new Set(input.days.map((day) => day.dayOfWeek)).size !== 7) {
      throw new BadRequestException("El horario debe incluir los siete dias de la semana")
    }

    const before = await this.prisma.employeeWorkSchedule.findUnique({ where: { employeeId } })
    const dayData = Object.fromEntries(input.days.flatMap((day) => {
      const name = scheduleDayNames[day.dayOfWeek]
      return [
        [`${name}Enabled`, day.enabled],
        [`${name}Start`, day.start],
        [`${name}End`, day.end]
      ]
    }))
    const data = {
      ...dayData,
      lateGraceMinutes: input.lateGraceMinutes,
      overtimeThresholdMinutes: input.overtimeThresholdMinutes
    } as Prisma.EmployeeWorkScheduleUncheckedCreateInput

    const schedule = await this.prisma.employeeWorkSchedule.upsert({
      where: { employeeId },
      create: { ...data, employeeId },
      update: data
    })

    await this.audit.log({
      userId: user.sub,
      action: before ? AuditAction.UPDATE : AuditAction.CREATE,
      entity: "EmployeeWorkSchedule",
      entityId: schedule.id,
      affectedEmployeeId: employee.id,
      oldValue: before ? this.toJson(this.scheduleResponse(before)) : undefined,
      newValue: this.toJson(this.scheduleResponse(schedule)),
      ipAddress
    })

    return { employee, configured: true, ...this.scheduleResponse(schedule) }
  }

  async decideOvertime(employeeId: string, date: string, input: DecideOvertimeInput, user: AuthUser, ipAddress?: string) {
    this.validDateOnly(date)
    if (input.status === OvertimeAuthorizationStatus.PENDING) {
      throw new BadRequestException("Selecciona autorizar o rechazar el tiempo extra")
    }
    const employee = await this.findVisibleEmployee(employeeId, user)
    const [schedule, entries, sessions, before] = await Promise.all([
      this.prisma.employeeWorkSchedule.findUnique({ where: { employeeId } }),
      this.prisma.timeClockEntry.findMany({
        where: this.entryScope({ employeeId, localDate: date }, user),
        orderBy: { occurredAt: "asc" }
      }),
      this.prisma.workSession.findMany({
        where: this.sessionScope({ employeeId, localDate: date }, user),
        include: { startEntry: true, endEntry: true },
        orderBy: { startedAt: "asc" }
      }),
      this.prisma.overtimeAuthorization.findUnique({ where: { employeeId_localDate: { employeeId, localDate: date } } })
    ])

    const calculation = this.calculateDay(date, schedule, entries, sessions)
    if (!calculation.scheduled) throw new BadRequestException("El empleado no tiene turno programado ese dia")
    if (!calculation.overtimeMinutes) throw new BadRequestException("No hay tiempo extra calculado para autorizar")

    const authorizedMinutes = input.status === OvertimeAuthorizationStatus.AUTHORIZED
      ? input.authorizedMinutes ?? calculation.overtimeMinutes
      : 0
    if (authorizedMinutes > calculation.overtimeMinutes) {
      throw new BadRequestException("Los minutos autorizados no pueden exceder el tiempo extra calculado")
    }

    const authorization = await this.prisma.overtimeAuthorization.upsert({
      where: { employeeId_localDate: { employeeId, localDate: date } },
      create: {
        employeeId,
        localDate: date,
        status: input.status,
        calculatedMinutes: calculation.overtimeMinutes,
        authorizedMinutes,
        notes: input.notes?.trim() || undefined,
        authorizedById: user.sub,
        authorizedAt: new Date()
      },
      update: {
        status: input.status,
        calculatedMinutes: calculation.overtimeMinutes,
        authorizedMinutes,
        notes: input.notes?.trim() || null,
        authorizedById: user.sub,
        authorizedAt: new Date()
      },
      include: { authorizedBy: { select: { id: true, fullName: true, role: true } } }
    })

    await this.audit.log({
      userId: user.sub,
      action: before ? AuditAction.UPDATE : AuditAction.CREATE,
      entity: "OvertimeAuthorization",
      entityId: authorization.id,
      affectedEmployeeId: employee.id,
      oldValue: before ? this.toJson(before) : undefined,
      newValue: this.toJson(authorization),
      ipAddress
    })
    return authorization
  }

  async attendance(filters: AttendanceFilters, user: AuthUser) {
    const date = filters.date || this.localParts(new Date()).localDate
    const branchId = this.effectiveBranchFilter(filters.branchId, user)
    const employeeWhere = this.definedEmployeeWhere({
      id: filters.employeeId,
      branchId,
      active: true
    })

    const [employees, entries, sessions, overtimeAuthorizations] = await Promise.all([
      this.prisma.employee.findMany({
        where: employeeWhere,
        include: { branch: true, workSchedule: true },
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
      }),
      this.prisma.overtimeAuthorization.findMany({
        where: {
          localDate: date,
          employee: employeeWhere
        },
        include: { authorizedBy: { select: { id: true, fullName: true, role: true } } }
      })
    ])

    const entriesByEmployee = this.groupBy(entries, (entry) => entry.employeeId)
    const sessionsByEmployee = this.groupBy(sessions, (session) => session.employeeId)
    const authorizationByEmployee = new Map(overtimeAuthorizations.map((item) => [item.employeeId, item]))

    return employees.map((employee) => {
      const employeeEntries = entriesByEmployee.get(employee.id) ?? []
      const employeeSessions = sessionsByEmployee.get(employee.id) ?? []
      const activeSession = employeeSessions.find((session) => session.status === WorkSessionStatus.ACTIVE)
      const lastEntry = employeeEntries[employeeEntries.length - 1]
      const calculation = this.calculateDay(date, employee.workSchedule, employeeEntries, employeeSessions)
      const status = activeSession
        ? "IN_SHIFT"
        : lastEntry?.type === TimeClockEventType.EXIT
          ? "EXITED"
          : calculation.scheduled
            ? "NO_SHOW"
            : "OFF"

      return {
        employee,
        branch: employee.branch,
        date,
        status,
        activeSession,
        lastEntry,
        entries: employeeEntries,
        sessions: employeeSessions,
        calculation,
        overtimeAuthorization: this.overtimeDecision(calculation.overtimeMinutes, authorizationByEmployee.get(employee.id))
      }
    })
  }

  async employeeHistory(employeeId: string, filters: HistoryFilters, user: AuthUser) {
    const employee = await this.findVisibleEmployee(employeeId, user)
    const range = this.resolveHistoryRange(filters)
    const [schedule, entries, sessions, adjustments, overtimeAuthorizations] = await Promise.all([
      this.prisma.employeeWorkSchedule.findUnique({ where: { employeeId } }),
      this.prisma.timeClockEntry.findMany({
        where: this.entryScope({ employeeId, localDateRange: this.localDateRange(range.from, range.to) }, user),
        include: this.entryInclude(),
        orderBy: { occurredAt: "desc" },
        take: 300
      }),
      this.prisma.workSession.findMany({
        where: this.sessionScope({ employeeId, localDateRange: this.localDateRange(range.from, range.to) }, user),
        include: {
          startEntry: true,
          endEntry: true
        },
        orderBy: { startedAt: "desc" },
        take: 300
      }),
      this.prisma.attendanceAdjustment.findMany({
        where: this.adjustmentScope({ employeeId }, user),
        include: {
          branch: true,
          adjustedBy: { select: { id: true, fullName: true, role: true } },
          entry: true,
          workSession: true
        },
        orderBy: { createdAt: "desc" },
        take: 100
      }),
      this.prisma.overtimeAuthorization.findMany({
        where: { employeeId, localDate: this.localDateRange(range.from, range.to) },
        include: { authorizedBy: { select: { id: true, fullName: true, role: true } } }
      })
    ])

    const entriesByDate = this.groupBy(entries, (entry) => entry.localDate)
    const sessionsByDate = this.groupBy(sessions, (session) => session.localDate)
    const authorizationByDate = new Map(overtimeAuthorizations.map((item) => [item.localDate, item]))
    const days = this.dateRangeValues(range.from, range.to)
      .map((date) => {
        const dayEntries = (entriesByDate.get(date) ?? []).slice().sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
        const daySessions = (sessionsByDate.get(date) ?? []).slice().sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
        const activeSession = daySessions.find((session) => session.status === WorkSessionStatus.ACTIVE)
        const lastEntry = dayEntries[dayEntries.length - 1]
        const calculation = this.calculateDay(date, schedule, dayEntries, daySessions)
        const status = activeSession
          ? "IN_SHIFT"
          : lastEntry?.type === TimeClockEventType.EXIT
            ? "EXITED"
            : calculation.scheduled
              ? "NO_SHOW"
              : "OFF"

        return {
          date,
          status,
          firstEntry: dayEntries.find((entry) => entry.type === TimeClockEventType.ENTRY) ?? null,
          lastExit: dayEntries.slice().reverse().find((entry) => entry.type === TimeClockEventType.EXIT) ?? null,
          entries: dayEntries,
          sessions: daySessions,
          totalMinutes: daySessions.reduce((total, session) => total + (session.totalMinutes ?? 0), 0),
          calculation,
          overtimeAuthorization: this.overtimeDecision(calculation.overtimeMinutes, authorizationByDate.get(date))
        }
      })
      .reverse()

    return {
      employee,
      range,
      summary: {
        days: days.length,
        presentDays: days.filter((day) => day.entries.length > 0).length,
        noShowDays: days.filter((day) => day.status === "NO_SHOW").length,
        entryCount: entries.filter((entry) => entry.type === TimeClockEventType.ENTRY).length,
        exitCount: entries.filter((entry) => entry.type === TimeClockEventType.EXIT).length,
        manualCount: entries.filter((entry) => entry.status === TimeClockEntryStatus.MANUAL).length,
        openSessions: sessions.filter((session) => session.status === WorkSessionStatus.ACTIVE).length,
        totalMinutes: sessions.reduce((total, session) => total + (session.totalMinutes ?? 0), 0),
        lateDays: days.filter((day) => day.calculation.lateStatus === "LATE").length,
        lateMinutes: days.reduce((total, day) => total + day.calculation.lateMinutes, 0),
        overtimeMinutes: days.reduce((total, day) => total + day.calculation.overtimeMinutes, 0),
        authorizedOvertimeMinutes: days.reduce((total, day) => total + (day.overtimeAuthorization.authorizedMinutes ?? 0), 0)
      },
      schedule: { configured: Boolean(schedule), ...this.scheduleResponse(schedule) },
      days,
      entries,
      sessions,
      adjustments
    }
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

      if (input.type === TimeClockEventType.BREAK_START || input.type === TimeClockEventType.BREAK_END) {
        const [activeSession, lastEntry] = await Promise.all([
          tx.workSession.findFirst({
            where: { employeeId: employee.id, status: WorkSessionStatus.ACTIVE },
            orderBy: { startedAt: "desc" }
          }),
          tx.timeClockEntry.findFirst({
            where: { employeeId: employee.id, status: { in: [TimeClockEntryStatus.VALID, TimeClockEntryStatus.MANUAL] } },
            orderBy: { occurredAt: "desc" },
            select: { type: true }
          })
        ])
        if (!activeSession) throw new BadRequestException("No existe una jornada activa")
        if (input.type === TimeClockEventType.BREAK_START && lastEntry?.type === TimeClockEventType.BREAK_START) {
          throw new BadRequestException("La salida de comida ya esta registrada")
        }
        if (input.type === TimeClockEventType.BREAK_END && lastEntry?.type !== TimeClockEventType.BREAK_START) {
          throw new BadRequestException("No existe una salida de comida pendiente")
        }
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
      } else if (input.type === TimeClockEventType.EXIT) {
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
      } else {
        session = await tx.workSession.findFirstOrThrow({
          where: { employeeId: employee.id, status: WorkSessionStatus.ACTIVE },
          orderBy: { startedAt: "desc" }
        })
        oldValue = this.toJson(session)
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
    const header = ["Fecha", "Sucursal", "Empleado", "Puesto", "Estado", "Turno", "Entrada", "Salida", "Minutos trabajados", "Retardo", "Salida anticipada", "Tiempo extra", "Estado tiempo extra"].join(",")
    const lines = rows.map((row) => {
      const session = row.sessions[row.sessions.length - 1]
      return [
        row.date,
        row.branch.name,
        row.employee.fullName,
        row.employee.position,
        this.statusLabel(row.status),
        row.calculation.scheduled ? `${row.calculation.scheduledStart}-${row.calculation.scheduledEnd}` : "Descanso",
        session?.startEntry?.localTime ?? "",
        session?.endEntry?.localTime ?? "",
        row.calculation.workedMinutes,
        row.calculation.lateMinutes,
        row.calculation.earlyDepartureMinutes,
        row.calculation.overtimeMinutes,
        row.overtimeAuthorization.status
      ].map((value) => this.csvValue(value)).join(",")
    })
    return `\uFEFF${header}\n${lines.join("\n")}`
  }

  async ensureEmployeeHasActiveShift(
    employeeId: string,
    kind: MovementKind,
    metadata: RequestMetadata & { userId?: string; device?: string; context?: string }
  ) {
    if (!movementKindsThatRequireActiveShift.has(kind)) return

    const active = await this.prisma.workSession.findFirst({
      where: {
        employeeId,
        status: WorkSessionStatus.ACTIVE
      },
      select: { id: true, localDate: true, startedAt: true }
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
        checkedLocalDate: this.localParts(new Date()).localDate,
        context: metadata.context,
        device: metadata.device,
        userAgent: metadata.userAgent
      }),
      ipAddress: metadata.ipAddress
    })
    throw new ForbiddenException("El empleado no tiene turno activo registrado.")
  }

  private async assertEntryAllowed(employeeId: string, type: TimeClockEventType) {
    const [activeSession, lastEntry] = await Promise.all([
      this.prisma.workSession.findFirst({
        where: { employeeId, status: WorkSessionStatus.ACTIVE },
        select: { id: true }
      }),
      this.prisma.timeClockEntry.findFirst({
        where: { employeeId, status: { in: [TimeClockEntryStatus.VALID, TimeClockEntryStatus.MANUAL] } },
        orderBy: { occurredAt: "desc" },
        select: { type: true }
      })
    ])

    if (type === TimeClockEventType.ENTRY && activeSession) {
      throw new BadRequestException("El empleado ya tiene una entrada activa")
    }
    if (type === TimeClockEventType.EXIT && !activeSession) {
      throw new BadRequestException("No existe entrada activa para registrar salida")
    }
    if (type === TimeClockEventType.EXIT && lastEntry?.type === TimeClockEventType.BREAK_START) {
      throw new BadRequestException("Registra la entrada de comida antes de finalizar la jornada")
    }
    if (type === TimeClockEventType.BREAK_START && !activeSession) {
      throw new BadRequestException("Debes registrar entrada antes de salir a comida")
    }
    if (type === TimeClockEventType.BREAK_START && lastEntry?.type === TimeClockEventType.BREAK_START) {
      throw new BadRequestException("La salida de comida ya esta registrada")
    }
    if (type === TimeClockEventType.BREAK_END && (!activeSession || lastEntry?.type !== TimeClockEventType.BREAK_START)) {
      throw new BadRequestException("No existe una salida de comida pendiente")
    }
  }

  private timeClockEventLabel(type: TimeClockEventType) {
    const labels: Record<TimeClockEventType, string> = {
      ENTRY: "Entrada registrada",
      EXIT: "Salida registrada",
      BREAK_START: "Salida de comida registrada",
      BREAK_END: "Entrada de comida registrada"
    }
    return labels[type]
  }

  private async assertMinimumGap(employeeId: string, now: Date) {
    const lastEntry = await this.prisma.timeClockEntry.findFirst({
      where: {
        employeeId,
        status: { in: [TimeClockEntryStatus.VALID, TimeClockEntryStatus.MANUAL] }
      },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true, type: true }
    })
    if (!lastEntry) return

    const elapsedMs = now.getTime() - lastEntry.occurredAt.getTime()
    if (elapsedMs >= minimumTimeClockGapMs) return

    const remainingSeconds = Math.ceil((minimumTimeClockGapMs - elapsedMs) / 1000)
    throw new BadRequestException(`Espera ${remainingSeconds} segundos antes de registrar otra checada`)
  }

  private async assertDrinkGap(employeeId: string, deviceId: string, now: Date) {
    const lastDrink = await this.prisma.movement.findFirst({
      where: {
        employeeId,
        kind: MovementKind.DRINK,
        status: { not: MovementStatus.CANCELED },
        requestDevice: `time-clock:${deviceId}`
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
    })
    if (!lastDrink) return

    const elapsedMs = now.getTime() - lastDrink.createdAt.getTime()
    if (elapsedMs >= minimumDrinkGapMs) return

    const remainingSeconds = Math.ceil((minimumDrinkGapMs - elapsedMs) / 1000)
    throw new BadRequestException(`Bebida ya registrada. Espera ${remainingSeconds} segundos para registrar otra.`)
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

  private async findEmployeeByCode(branchId: string, employeeCode: string) {
    const employees = await this.prisma.employee.findMany({
      where: { branchId, active: true },
      include: { branch: true },
      orderBy: { fullName: "asc" }
    })

    for (const employee of employees) {
      if (await bcrypt.compare(employeeCode, employee.pinHash)) return employee
    }
    return null
  }

  private normalizeEmployeeCode(value: string) {
    return value.trim().replace(/\D/g, "").slice(0, 12)
  }

  private timeClockThrottleIdentifier(deviceId: string, employeeCode: string, ipAddress?: string) {
    const ip = ipAddress?.trim() || "unknown-ip"
    return `${deviceId}:${employeeCode}:${ip}`
  }

  private async findVisibleDevice(id: string, user: AuthUser) {
    const device = await this.prisma.timeClockDevice.findFirst({
      where: { id, ...this.deviceScope(user) },
      include: { branch: true, createdBy: { select: { id: true, fullName: true, role: true } } }
    })
    if (!device) throw new NotFoundException("Dispositivo no encontrado")
    return device
  }

  private isDeveloperMaintenanceEnabled() {
    const value = this.config.get<string>("ENABLE_DEVELOPER_MAINTENANCE")
    return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase())
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

  private async findVisibleEmployee(employeeId: string, user: AuthUser) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        ...(user.role === Role.ENCARGADO ? { branchId: user.branchId ?? "__none__" } : {})
      },
      include: { branch: true }
    })
    if (!employee) throw new NotFoundException("Empleado no encontrado o fuera de alcance")
    return employee
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
    filters: { localDate?: string; localDateRange?: Prisma.StringFilter; branchId?: string; employeeId?: string },
    user: AuthUser
  ): Prisma.WorkSessionWhereInput {
    return this.definedSessionWhere({
      localDate: filters.localDateRange ?? filters.localDate,
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

  private calculateDay(
    date: string,
    schedule: ScheduleRecord | null | undefined,
    entries: Array<{ type: TimeClockEventType; localDate: string; localTime: string }>,
    sessions: Array<{ totalMinutes: number | null; endEntry?: { localDate: string; localTime: string } | null }>
  ) {
    const firstEntry = entries.find((entry) => entry.type === TimeClockEventType.ENTRY)
    const lastExit = entries.slice().reverse().find((entry) => entry.type === TimeClockEventType.EXIT)
    return calculateAttendance({
      date,
      schedule,
      firstEntry,
      lastExit,
      workedMinutes: sessions.reduce((total, session) => total + (session.totalMinutes ?? 0), 0)
    })
  }

  private overtimeDecision(
    calculatedMinutes: number,
    authorization?: {
      id: string
      status: OvertimeAuthorizationStatus
      calculatedMinutes: number
      authorizedMinutes: number | null
      notes: string | null
      authorizedAt: Date | null
      authorizedBy?: { id: string; fullName: string; role: Role } | null
    }
  ) {
    if (!calculatedMinutes) return { status: "NONE" as const, calculatedMinutes: 0, authorizedMinutes: 0 }
    if (!authorization) {
      return { status: OvertimeAuthorizationStatus.PENDING, calculatedMinutes, authorizedMinutes: null }
    }
    return {
      ...authorization,
      calculatedMinutes,
      authorizedMinutes: authorization.status === OvertimeAuthorizationStatus.AUTHORIZED
        ? Math.min(authorization.authorizedMinutes ?? calculatedMinutes, calculatedMinutes)
        : 0
    }
  }

  private scheduleResponse(schedule: ScheduleRecord | null | undefined) {
    const defaults = {
      lateGraceMinutes: 5,
      overtimeThresholdMinutes: 15,
      sundayEnabled: false, sundayStart: "09:00", sundayEnd: "17:00",
      mondayEnabled: true, mondayStart: "09:00", mondayEnd: "17:00",
      tuesdayEnabled: true, tuesdayStart: "09:00", tuesdayEnd: "17:00",
      wednesdayEnabled: true, wednesdayStart: "09:00", wednesdayEnd: "17:00",
      thursdayEnabled: true, thursdayStart: "09:00", thursdayEnd: "17:00",
      fridayEnabled: true, fridayStart: "09:00", fridayEnd: "17:00",
      saturdayEnabled: false, saturdayStart: "09:00", saturdayEnd: "17:00"
    } satisfies ScheduleRecord
    const value = schedule ?? defaults
    return {
      lateGraceMinutes: value.lateGraceMinutes,
      overtimeThresholdMinutes: value.overtimeThresholdMinutes,
      days: [1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => {
        const name = scheduleDayNames[dayOfWeek]
        return {
          dayOfWeek,
          enabled: value[`${name}Enabled`],
          start: value[`${name}Start`],
          end: value[`${name}End`]
        }
      })
    }
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

  private resolveHistoryRange(filters: HistoryFilters) {
    const today = this.localParts(new Date()).localDate
    const to = this.validDateOnly(filters.to) ?? today
    const defaultFrom = this.addDays(to, -29)
    const from = this.validDateOnly(filters.from) ?? defaultFrom
    if (from > to) throw new BadRequestException("Rango de fechas invalido")
    if (this.dateRangeValues(from, to).length > 93) throw new BadRequestException("El historial permite maximo 93 dias por consulta")
    return { from, to }
  }

  private validDateOnly(value?: string) {
    if (!value) return undefined
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException("Fecha invalida")
    return value
  }

  private addDays(date: string, days: number) {
    const value = new Date(`${date}T00:00:00.000Z`)
    value.setUTCDate(value.getUTCDate() + days)
    return value.toISOString().slice(0, 10)
  }

  private dateRangeValues(from: string, to: string) {
    const dates: string[] = []
    let cursor = from
    while (cursor <= to) {
      dates.push(cursor)
      cursor = this.addDays(cursor, 1)
    }
    return dates
  }

  private generateDeviceToken() {
    return randomBytes(32).toString("base64url")
  }

  private hashDeviceToken(token: string) {
    return createHash("sha256").update(token.trim()).digest("hex")
  }

  private isValidDeviceToken(token: string) {
    return /^[A-Za-z0-9_-]{32,160}$/.test(token)
  }

  private async nextDeviceRequestCode() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = `TC-${String(randomBytes(3).readUIntBE(0, 3) % 1_000_000).padStart(6, "0")}`
      const existing = await this.prisma.timeClockDeviceRequest.findUnique({ where: { code }, select: { id: true } })
      if (!existing) return code
    }
    throw new BadRequestException("No se pudo generar codigo de dispositivo")
  }

  private async nextMovementFolio() {
    const now = new Date()
    const prefix = `MOV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`
    const count = await this.prisma.movement.count({
      where: {
        createdAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        }
      }
    })
    return `${prefix}-${String(count + 1).padStart(4, "0")}`
  }

  private async expireOldDeviceRequests() {
    await this.prisma.timeClockDeviceRequest.updateMany({
      where: {
        status: TimeClockDeviceRequestStatus.PENDING,
        expiresAt: { lte: new Date() }
      },
      data: { status: TimeClockDeviceRequestStatus.EXPIRED }
    })
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
    if (status === "OFF") return "Descanso"
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
