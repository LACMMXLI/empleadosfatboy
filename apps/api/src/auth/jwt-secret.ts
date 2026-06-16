import { ConfigService } from "@nestjs/config"

const MIN_PRODUCTION_JWT_SECRET_LENGTH = 32

export function requiredJwtSecret(config: ConfigService) {
  const secret = config.get<string>("JWT_SECRET")?.trim()
  const nodeEnv = config.get<string>("NODE_ENV")?.trim().toLowerCase()

  if (!secret) {
    throw new Error("JWT_SECRET is required.")
  }

  if (nodeEnv === "production" && secret.length < MIN_PRODUCTION_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_PRODUCTION_JWT_SECRET_LENGTH} characters in production.`)
  }

  return secret
}
