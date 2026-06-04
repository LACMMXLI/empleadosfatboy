import "reflect-metadata"
import compression from "compression"
import helmet from "helmet"
import rateLimit from "express-rate-limit"
import { NestFactory } from "@nestjs/core"
import { ValidationPipe } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const config = app.get(ConfigService)

  app.use(helmet())
  app.use(compression())
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 180,
      standardHeaders: true,
      legacyHeaders: false
    })
  )
  app.enableCors({
    origin: config.get<string>("WEB_ORIGIN") ?? true,
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
