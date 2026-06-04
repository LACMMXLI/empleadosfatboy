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
```

Si Coolify te asigna dominio HTTPS al servicio `web`, deja `VITE_API_URL=/api`. Esa es la configuracion recomendada.

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
