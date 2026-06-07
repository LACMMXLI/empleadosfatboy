import "reflect-metadata"
import compression from "compression"
import helmet from "helmet"
import rateLimit, { ipKeyGenerator } from "express-rate-limit"
import { NestFactory } from "@nestjs/core"
import { ValidationPipe } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { NestExpressApplication } from "@nestjs/platform-express"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const config = app.get(ConfigService)
  const configuredTrustProxyHops = Number(config.get("TRUST_PROXY_HOPS") ?? 1)
  const trustProxyHops =
    Number.isInteger(configuredTrustProxyHops) && configuredTrustProxyHops > 0 ? configuredTrustProxyHops : 1

  app.set("trust proxy", trustProxyHops)

  app.use(helmet())
  app.use(compression())
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 180,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (request) => {
        const cloudflareIp = request.headers["cf-connecting-ip"]
        const clientIp = Array.isArray(cloudflareIp) ? cloudflareIp[0] : cloudflareIp

        return ipKeyGenerator(clientIp || request.ip || request.socket.remoteAddress || "")
      }
    })
  )
  const webOrigin = config.get<string>("WEB_ORIGIN")?.trim()
  app.enableCors({
    origin: webOrigin || true,
    credentials: true
  })
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  )

  const port = Number(config.get("PORT") ?? 3001)
  await app.listen(port)
  console.log(`API listening on http://localhost:${port}`)
}

void bootstrap()
