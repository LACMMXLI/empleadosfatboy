# Fatboy Employee Ledger

Aplicacion web para controlar adelantos, prestamos, consumos internos y salidas de efectivo de empleados de restaurante.

## Arquitectura

- `apps/api`: NestJS + Prisma + PostgreSQL. Autoridad de negocio para saldos, reglas, autorizaciones y auditoria.
- `apps/web`: React + Vite + TypeScript + Tailwind. Cliente operacional para caja, encargados y administracion.

## Primer arranque

1. Copia `.env.example` a `.env` dentro de `apps/api` y ajusta `DATABASE_URL`.
2. Instala dependencias: `npm install`.
3. Genera Prisma: `npm run prisma:generate`.
4. Ejecuta migraciones: `npm run prisma:migrate`.
5. Carga datos iniciales: `npm run seed`.
6. Inicia desarrollo: `npm run dev`.

Usuario inicial del seed:

- Email: `admin@fatboy.local`
- Password: `Admin123!`

## Reglas clave

- El backend calcula saldos y valida autorizaciones.
- Las cancelaciones no borran registros; solo cambian estado.
- Todo cambio relevante queda en `AuditLog`.
- El frontend no duplica reglas de negocio.
