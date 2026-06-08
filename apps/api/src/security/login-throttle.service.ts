import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"

type LoginThrottleScope = "admin" | "employee"

type LoginThrottleMetadata = {
  ipAddress?: string
  userAgent?: string
}

const MAX_FREE_ATTEMPTS = 5
const FIRST_LOCK_MS = 2 * 60 * 1000
const MAX_LOCK_MS = 60 * 60 * 1000
const FAILURE_COOLDOWN_MS = 30 * 60 * 1000

@Injectable()
export class LoginThrottleService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanAttempt(scope: LoginThrottleScope, identifier: string) {
    const normalizedIdentifier = this.normalizeIdentifier(identifier)
    const record = await this.prisma.loginThrottle.findUnique({
      where: { scope_identifier: { scope, identifier: normalizedIdentifier } }
    })

    if (!record?.lockedUntil) return

    const now = new Date()
    if (record.lockedUntil <= now) return

    const retryAfterSeconds = Math.max(1, Math.ceil((record.lockedUntil.getTime() - now.getTime()) / 1000))
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Demasiados intentos fallidos. Intenta de nuevo en ${this.formatRetryAfter(retryAfterSeconds)}.`,
        retryAfterSeconds
      },
      HttpStatus.TOO_MANY_REQUESTS
    )
  }

  async recordFailure(scope: LoginThrottleScope, identifier: string, metadata: LoginThrottleMetadata = {}) {
    const normalizedIdentifier = this.normalizeIdentifier(identifier)
    const now = new Date()

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.loginThrottle.findUnique({
        where: { scope_identifier: { scope, identifier: normalizedIdentifier } }
      })

      const shouldCoolDown =
        existing?.lastFailureAt &&
        !this.isLocked(existing.lockedUntil, now) &&
        now.getTime() - existing.lastFailureAt.getTime() > FAILURE_COOLDOWN_MS

      const currentFailures = shouldCoolDown ? 0 : existing?.failedAttempts ?? 0
      const failedAttempts = currentFailures + 1
      const lockedUntil = this.resolveLockedUntil(failedAttempts, now)
      const data = {
        failedAttempts,
        lockedUntil,
        lastFailureAt: now,
        lastFailureIp: metadata.ipAddress,
        lastUserAgent: metadata.userAgent
      }

      await tx.loginThrottle.upsert({
        where: { scope_identifier: { scope, identifier: normalizedIdentifier } },
        create: {
          scope,
          identifier: normalizedIdentifier,
          ...data
        },
        update: data
      })
    })
  }

  async recordSuccess(scope: LoginThrottleScope, identifier: string) {
    const normalizedIdentifier = this.normalizeIdentifier(identifier)
    await this.prisma.loginThrottle.deleteMany({
      where: { scope, identifier: normalizedIdentifier }
    })
  }

  private normalizeIdentifier(identifier: string) {
    return identifier.trim().toLowerCase()
  }

  private resolveLockedUntil(failedAttempts: number, now: Date) {
    if (failedAttempts < MAX_FREE_ATTEMPTS) return null

    const lockLevel = failedAttempts - MAX_FREE_ATTEMPTS
    const durationMs = Math.min(FIRST_LOCK_MS * 2 ** lockLevel, MAX_LOCK_MS)

    return new Date(now.getTime() + durationMs)
  }

  private isLocked(lockedUntil: Date | null, now: Date) {
    return Boolean(lockedUntil && lockedUntil > now)
  }

  private formatRetryAfter(seconds: number) {
    if (seconds < 60) return `${seconds} segundos`

    const minutes = Math.ceil(seconds / 60)
    return `${minutes} minutos`
  }
}
