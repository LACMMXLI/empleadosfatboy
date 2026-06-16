# Despliegue en Linux con Coolify

Esta configuracion despliega dos servicios en el mismo servidor:

- `web`: frontend React compilado y servido por Nginx.
- `api`: backend NestJS.

La base de datos PostgreSQL se usa como servicio externo mediante `DATABASE_URL`.

El navegador usa `VITE_API_URL=/api`. Nginx recibe `/api/*` y lo envia internamente al servicio `api:3001`, por lo que no necesitas exponer el backend como dominio separado.

## Archivos relevantes

- `docker-compose.coolify.yml`
- `apps/api/Dockerfile`
- `apps/api/docker-entrypoint.sh`
- `apps/web/Dockerfile`
- `apps/web/nginx.conf`
- `.env.production.example`

## Variables en Coolify

Crea estas variables en el proyecto/compose de Coolify:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB?schema=public
JWT_SECRET=usa-un-secreto-largo-y-unico
VITE_API_URL=/api
WEB_PORT=80
WEB_ORIGIN=
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=ACCESS_KEY_DE_MINIO
S3_SECRET_KEY=SECRET_KEY_DE_MINIO
S3_BUCKET=fatboy-file
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
```

Si Coolify te asigna dominio HTTPS al servicio `web`, deja `VITE_API_URL=/api`. Esa es la configuracion recomendada.

## MinIO

El frontend no se conecta directo a MinIO. El flujo correcto es:

```text
Frontend -> /api -> backend NestJS -> MinIO
```

`S3_ENDPOINT` debe apuntar al hostname interno del servicio MinIO dentro de Docker/Coolify, no a `127.0.0.1`. Si el servicio MinIO esta en la misma red y se llama `minio`, usa:

```env
S3_ENDPOINT=http://minio:9000
```

Si Coolify creo el recurso con otro nombre, usa ese nombre interno del servicio en lugar de `minio`. El puerto de API S3 es `9000`; el puerto `9001` es solo para el panel web de MinIO.

## Pasos en Coolify

1. Crea un nuevo recurso desde el repositorio GitHub.
2. Elige despliegue por Docker Compose.
3. Usa como compose file:

```text
docker-compose.coolify.yml
```

4. Configura las variables de entorno anteriores.
5. Expone solo el servicio `web` hacia internet.
6. Despliega.

## Base de datos

El backend usa la variable `DATABASE_URL`. Para este despliegue debe apuntar a tu PostgreSQL externo:

```text
postgresql://USER:PASSWORD@HOST:5432/DB?schema=public
```

El contenedor de API ejecuta automaticamente:

```bash
prisma migrate deploy
```

antes de iniciar NestJS.

La migracion de nomina esta incluida en:

```text
apps/api/prisma/migrations/20260604225000_add_payroll_module/migration.sql
```

Esa migracion crea:

- Campos laborales en `Employee`: `salaryAmount`, `salaryType`, `hireDate`.
- Tablas `Payroll`, `PayrollItem`, `PayrollItemMovement`.
- `Payroll.periodKey` unico para impedir nominas duplicadas por periodo.
- `PayrollItemMovement.movementId` unico para impedir doble descuento de movimientos.

## Arranque seguro de API

El entrypoint de API ahora hace este orden:

1. Valida `DATABASE_URL`.
2. Valida `JWT_SECRET`.
3. Espera a que PostgreSQL acepte conexiones.
4. Ejecuta `prisma migrate deploy`.
5. Inicia NestJS.

### Rotacion de `JWT_SECRET`

`JWT_SECRET` firma las sesiones de administradores y del portal de empleados. En produccion debe existir y tener al menos 32 caracteres; si falta o es corto, la API no arranca.

Para rotarlo:

1. Genera un secreto nuevo, largo y unico.
2. Cambia `JWT_SECRET` en el entorno de Coolify.
3. Reinicia/redeploya la API.
4. Considera todas las sesiones anteriores expiradas: los tokens firmados con el secreto viejo dejaran de validar y los usuarios deberan iniciar sesion otra vez.

Esto evita fallos intermitentes cuando Coolify levanta el contenedor de API antes de que la base externa este lista.

Variable opcional:

```env
COOLIFY_DB_WAIT_TIMEOUT=60000
```

## Diagnostico rapido de 502 en `/api/auth/login`

Si el frontend abre pero el login responde 502, el problema esta entre Nginx del servicio `web` y el servicio `api`.

Verifica en Coolify:

1. El servicio `api` debe estar `running` y con healthcheck sano.
2. En logs de `api`, confirma que aparezca `API listening on http://localhost:3001`.
3. Si `api` se apaga antes de iniciar, revisa primero `DATABASE_URL`, `JWT_SECRET` y errores de `prisma migrate deploy`.
4. Deja `VITE_API_URL=/api` en el build del servicio `web`; no uses una IP LAN para produccion.
5. No expongas `api` al exterior si `web` y `api` estan en el mismo compose; Nginx usa el hostname interno `api:3001`.

## Verificar migraciones

Desde la consola del contenedor `api`:

```bash
npm run prisma:status --workspace apps/api
```

O desde el workspace `apps/api`:

```bash
npm run prisma:status
```

## Reset de base de datos

Solo usar en una base de pruebas o cuando aceptes perder todos los datos.

Desde la raiz del repo o contenedor:

```bash
CONFIRM_RESET=YES sh apps/api/scripts/coolify-reset-db.sh
```

Desde `apps/api`:

```bash
CONFIRM_RESET=YES sh scripts/coolify-reset-db.sh
```

El script espera la base de datos y ejecuta:

```bash
prisma migrate reset --force --skip-seed
```

No se ejecuta automaticamente en despliegue. En produccion normal se usa `migrate deploy`, no reset.

## Primer usuario

Despues del primer despliegue, si necesitas cargar el seed inicial, entra al contenedor `api` y ejecuta:

```bash
npm run seed --workspace apps/api
```

Usuario inicial del seed:

- Email: `admin@fatboy.local`
- Password: `Admin123!`

## PWA de empleados

El portal del empleado esta preparado como PWA en:

```text
/employee
```

Para instalarla en moviles, usa HTTPS en el dominio del servicio `web`. En red local por HTTP puede abrir, pero la instalacion PWA completa depende del navegador.
