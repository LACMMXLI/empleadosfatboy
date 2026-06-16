# Analisis detallado del sistema actual

Fecha de revision: 2026-06-15  
Alcance: este analisis usa solamente el codigo presente en este repositorio (`c:\Nueva carpeta (2)`). No se tomo contexto de otros sistemas o proyectos.

## 1. Resumen ejecutivo

El sistema actual es una aplicacion web para control de empleados, movimientos economicos, nomina, incidencias, archivos y checador de asistencia.

Arquitectura observada:

- Backend: NestJS, Prisma, PostgreSQL, JWT, validacion global, auditoria, rate limit, Helmet, compresion.
- Frontend: React, Vite, TypeScript, Tailwind, React Query, PWA para portal empleado/admin.
- Almacenamiento de archivos: S3/MinIO.
- Despliegue: Docker Compose local y Compose para Coolify.

Estado de verificacion:

- `npm run typecheck`: pasa.
- `npm run test:scope:movements --workspace apps/api`: pasa.
- `npm run test:scope:employees --workspace apps/api`: pasa.
- `npm run test:payroll:accounting --workspace apps/api`: pasa.
- `npm run build`: pasa.
- Advertencia del build web: bundle JS principal de `518.28 kB` y logo de `1,915.49 kB`.

Conclusion general:

El sistema ya tiene una base solida: roles, auditoria, Prisma, validacion DTO, scopes en varias consultas, pruebas puntuales y Docker. Sin embargo, hay fallas importantes en autorizacion por sucursal en operaciones de escritura, riesgos de seguridad por secretos por defecto y tokens en `localStorage`, generacion de folios vulnerable a colisiones en concurrencia, endpoints destructivos de mantenimiento que deben blindarse mas, y falta de cobertura automatizada sobre flujos criticos.

## 2. Prioridades principales

### P0 - Corregir alcance por sucursal en escrituras criticas

Impacto: alto. Un usuario con rol operativo podria crear, autorizar, rechazar, entregar o modificar informacion fuera de su sucursal si conoce IDs validos.

Evidencia:

- `apps/api/src/employees/employees.controller.ts:106-115`: `ENCARGADO` puede crear/actualizar empleados, pero el servicio recibe `request.user.sub`, no el `AuthUser` completo.
- `apps/api/src/employees/employees.service.ts:71-112`: `create` y `update` no validan que el `branchId` pertenezca al usuario operativo.
- `apps/api/src/movements/movements.service.ts:166-202`: `create` valida PIN y empleado activo, pero no bloquea que `CAJERO` o `ENCARGADO` creen movimientos para empleados de otra sucursal.
- `apps/api/src/movements/movements.service.ts:356-421`: `authorize`, `deliver` y `reject` cargan por `findUnique({ id })`, sin aplicar `scopeForUser`.
- `apps/api/src/movements/movements.service.ts:447-632`: `markDiscounted` y el cambio de estado tampoco validan alcance por sucursal.

Pasos recomendados:

1. Cambiar las firmas de `EmployeesService.create/update` para recibir `AuthUser`, no solo `userId`.
2. Crear helpers reutilizables:
   - `ensureBranchWritable(branchId, user)`
   - `ensureEmployeeWritable(employeeId, user)`
   - `findVisibleMovementForWrite(id, user)`
3. En roles `CAJERO` y `ENCARGADO`, exigir que `branchId === user.branchId`.
4. En `MovementsService.create`, aplicar alcance antes de validar PIN o crear el movimiento.
5. En `authorize`, `deliver`, `reject`, `markDiscounted` y `changeStatus`, buscar el movimiento con `AND: [scopeForUser(user), { id }]`.
6. Agregar pruebas unitarias de scope para cada escritura, no solo para listados.

## 3. Fallas y riesgos detectados

### 3.1 Secreto JWT con fallback inseguro

Impacto: alto en produccion si se despliega sin `JWT_SECRET`.

Evidencia:

- `apps/api/src/auth/auth.service.ts:62`
- `apps/api/src/auth/jwt-auth.guard.ts:29`
- `apps/api/src/employee-portal/employee-portal.service.ts:67` y `:228`

El codigo usa `this.config.get<string>("JWT_SECRET") ?? "dev-secret"`. Si falta la variable, el sistema arranca con un secreto conocido.

Pasos:

1. Crear helper `requiredJwtSecret()` o validar config al arrancar.
2. En `NODE_ENV=production`, fallar el arranque si `JWT_SECRET` no existe o es corto.
3. Evitar fallback en firma/verificacion de tokens.
4. Documentar rotacion de secreto y expiracion de sesiones existentes.

### 3.2 `docker-compose.yml` contiene defaults inseguros

Impacto: medio/alto si se usa como despliegue real.

Evidencia:

- `docker-compose.yml:8`: password de Postgres por defecto.
- `docker-compose.yml:33`: `JWT_SECRET` por defecto.
- `docker-compose.yml:37-38`: credenciales S3 por defecto.

Pasos:

1. Para produccion, replicar la estrategia estricta de `docker-compose.coolify.yml`, usando `${VAR:?VAR is required}`.
2. Dejar defaults solo en un archivo claramente marcado como desarrollo.
3. Agregar un checklist de despliegue con secretos obligatorios.

### 3.3 Tokens persistidos en `localStorage`

Impacto: medio/alto. Si existe XSS, el atacante puede leer tokens admin, empleado y checador.

Evidencia:

- `apps/web/src/lib/api.ts:21-56`

Pasos:

1. Migrar sesion admin/empleado a cookies `HttpOnly`, `Secure`, `SameSite=Lax/Strict`.
2. Mantener token de dispositivo del checador separado, con rotacion y revocacion desde backend.
3. Agregar CSP en Nginx/API para reducir riesgo de XSS.
4. Revisar que ningun texto de usuario se renderice como HTML.

### 3.4 Folios por conteo diario pueden colisionar

Impacto: medio/alto bajo concurrencia. Dos requests simultaneos pueden calcular el mismo consecutivo y chocar contra `@unique`.

Evidencia:

- `apps/api/src/movements/movements.service.ts:655-683`
- `apps/api/src/incidents/incidents.service.ts:385-394`
- `apps/api/src/time-clock/time-clock.service.ts` usa patron similar para codigos de solicitudes.

Pasos:

1. Crear tabla `SequenceCounter` con clave por tipo y fecha (`MOV-20260615`, `INC-20260615`, `LIQ-20260615`).
2. Incrementar dentro de transaccion con `upsert/update` atomico.
3. Agregar retry controlado ante `P2002`.
4. Cubrir con prueba de concurrencia.

### 3.5 Endpoints destructivos de mantenimiento expuestos en rutas normales

Impacto: medio/alto. Estan protegidos por rol admin y `ENABLE_DEVELOPER_MAINTENANCE`, pero siguen compilados y accesibles.

Evidencia:

- `apps/api/src/employees/employees.controller.ts:119-121`
- `apps/api/src/incidents/incidents.controller.ts:85-87`
- `apps/api/src/time-clock/time-clock.controller.ts:242-244`
- Servicios revisan `ENABLE_DEVELOPER_MAINTENANCE` en empleados, incidencias y checador.

Pasos:

1. Exigir una segunda cabecera de confirmacion con token de mantenimiento temporal.
2. Registrar auditoria antes y despues de la purga.
3. Bloquear estos endpoints en `NODE_ENV=production` salvo ventana explicita.
4. Moverlos a un modulo `MaintenanceModule` cargado solo si la variable esta activa.

### 3.6 Falta validacion fuerte de fechas

Impacto: medio. Varias rutas aceptan strings y hacen `new Date(...)`; fechas invalidas pueden producir consultas incorrectas o errores no controlados.

Evidencia:

- `apps/api/src/movements/movements.service.ts:758-839`
- `apps/api/src/incidents/incidents.service.ts:358-359`
- `apps/api/src/employees/employees.service.ts:338-341`

Pasos:

1. Crear DTOs con `@IsDateString()` para fechas.
2. Crear helper `parseLocalDateOrThrow(value, field)`.
3. Usar rangos inclusivos consistentes: inicio de dia y siguiente dia exclusivo.
4. Agregar pruebas para fechas invalidas, rangos invertidos y zona horaria.

### 3.7 Validacion insuficiente en algunas reglas administrativas

Impacto: medio.

Evidencia:

- `apps/api/src/configuration/configuration.service.ts:47-63`: no valida que `maxAmount >= minAmount`.
- `apps/api/src/configuration/configuration.service.ts:35-40`: reglas activas pueden solaparse.
- `apps/api/src/payroll/payroll.service.ts:280-366`: nomina calcula todos los empleados activos sin filtro por sucursal o tipo de periodo.

Pasos:

1. Validar que `maxAmount` no sea menor que `minAmount`.
2. Evitar reglas solapadas por `kind` y rango.
3. Definir si nomina debe ser global, por sucursal o por calendario laboral.
4. Agregar constraints o validaciones transaccionales.

### 3.8 Subida de archivos solo valida MIME reportado por cliente

Impacto: medio.

Evidencia:

- `apps/api/src/files/files.service.ts:194-199`
- `apps/api/src/files.controller.ts:46-50`
- `apps/api/src/time-clock/time-clock.controller.ts:170-176`

Pasos:

1. Verificar firma real del archivo con magic bytes.
2. Reprocesar imagen con libreria segura para eliminar metadata peligrosa.
3. Guardar hash del archivo para auditoria.
4. Aplicar cuotas por usuario/sucursal.

### 3.9 CORS queda abierto si falta `WEB_ORIGIN`

Impacto: medio.

Evidencia:

- `apps/api/src/main.ts:37-40`: `origin: webOrigin || true`.

Pasos:

1. En produccion, exigir `WEB_ORIGIN`.
2. Permitir lista separada por coma para admin/empleado si hace falta.
3. En desarrollo, permitir `true` solo si `NODE_ENV !== "production"`.

### 3.10 Bundle frontend grande y asset pesado

Impacto: medio para carga inicial y PWA.

Evidencia:

- `npm run build`: `assets/index-BCQGh8TE.js` pesa `518.28 kB`; Vite emite warning.
- `npm run build`: `assets/logo-DFcyIQ9n.png` pesa `1,915.49 kB`.
- `apps/web/src/App.tsx:7-9`: importa de forma estatica AdminShell, EmployeePortal y TimeClockKiosk.

Pasos:

1. Convertir rutas principales a `React.lazy`: admin, empleado y checador.
2. Separar `recharts` y vistas administrativas en chunks.
3. Optimizar `apps/web/src/assets/logo.png` a WebP/AVIF o versiones responsivas.
4. Agregar budget de bundle en CI.

## 4. Mejoras recomendadas por modulo

### Backend/API

1. Centralizar autorizacion de alcance.
   - Crear helpers de scope por entidad.
   - Aplicar los mismos helpers en lectura y escritura.

2. Endurecer configuracion.
   - Validar variables obligatorias al arranque.
   - Bloquear defaults inseguros en produccion.
   - Documentar variables minimas.

3. Mejorar errores y auditoria.
   - No borrar logs de auditoria en purgas sin crear antes una evidencia durable.
   - Estandarizar `entity`, `entityId`, `affectedEmployeeId`.
   - Registrar cambios de estado con causa cuando aplique.

4. Fortalecer concurrencia.
   - Folios con secuencias atomicas.
   - Operaciones de estado con condicion de estado actual en `where`.
   - Retry controlado ante conflictos unicos.

5. Ampliar pruebas.
   - Scope de escrituras.
   - Login/throttle.
   - Folios concurrentes.
   - Nomina con movimientos ya ligados.
   - Subida/lectura/eliminacion de archivos.

### Frontend

1. Reducir carga inicial.
   - Lazy loading por portal.
   - Chunks manuales para admin/reportes.
   - Optimizar logo.

2. Manejo de sesion.
   - Migrar token admin/empleado fuera de `localStorage`.
   - Implementar expiracion visible y logout automatico en `401`.

3. UX de errores.
   - El helper `request` asume JSON en errores; mejorar para texto/HTML.
   - Mostrar mensajes por campo cuando backend retorna validaciones.

4. PWA.
   - Revisar cache busting de service workers.
   - Separar cache admin/empleado/checador.
   - Probar actualizacion offline/online.

### Base de datos

1. Agregar secuencia atomica de folios.
2. Revisar indices para consultas por fecha/sucursal/estado:
   - `Movement(status, branchId, createdAt)`
   - `Incident(branchId, status, createdAt)`
   - `TimeClockEntry(branchId, localDate, employeeId)`
3. Evaluar soft delete en entidades sensibles en vez de purga fisica.
4. Agregar constraints para reglas de autorizacion si se mantiene logica en BD.

### Despliegue

1. Usar `docker-compose.coolify.yml` como base productiva, no el compose local con defaults.
2. Agregar healthcheck tambien al compose local.
3. Agregar pipeline minimo:
   - install
   - prisma generate
   - typecheck
   - tests
   - build
4. Agregar verificacion de migraciones antes de desplegar.

## 5. Plan de implementacion sugerido

### Fase 1 - Seguridad y control de alcance

Objetivo: cerrar riesgos que permiten operar fuera de sucursal o con configuracion insegura.

Pasos:

1. Backend: cambiar `EmployeesService.create/update` para recibir `AuthUser`.
2. Backend: validar `branchId` en empleados para `CAJERO`/`ENCARGADO`.
3. Backend: aplicar `scopeForUser` en escrituras de movimientos.
4. Backend: crear pruebas para:
   - cajero no crea movimiento de otra sucursal;
   - encargado no autoriza movimiento de otra sucursal;
   - encargado no crea empleado en otra sucursal;
   - admin/gerente conservan permisos definidos.
5. Config: eliminar fallback `dev-secret` en produccion.
6. Config: exigir `WEB_ORIGIN` y `JWT_SECRET` en produccion.

### Fase 2 - Integridad operacional

Objetivo: evitar duplicados, errores de fechas y estados inconsistentes.

Pasos:

1. Crear modelo `SequenceCounter`.
2. Migrar generacion de folios `MOV`, `INC`, `LIQ` y solicitudes de dispositivo.
3. Cambiar actualizaciones de estado a operaciones condicionales:
   - autorizar solo si sigue `PENDING`;
   - entregar solo si sigue `AUTHORIZED` y `deliveredAt` es null;
   - liquidar solo si sigue en estado liquidable.
4. Validar fechas con DTOs y helpers.
5. Agregar pruebas de concurrencia.

### Fase 3 - Mantenimiento y archivos

Objetivo: reducir riesgo de perdida irreversible y mejorar seguridad de evidencia.

Pasos:

1. Mover purgas a `MaintenanceModule`.
2. Exigir token de mantenimiento temporal.
3. Guardar auditoria previa fuera de los registros eliminados.
4. Validar magic bytes de imagenes.
5. Agregar limite de cantidad/tamano por usuario o sucursal.

### Fase 4 - Rendimiento frontend y PWA

Objetivo: mejorar carga inicial y estabilidad de actualizaciones.

Pasos:

1. Implementar `React.lazy` en `App.tsx` para admin, empleado y checador.
2. Agregar `manualChunks` en Vite.
3. Convertir logo a formato optimizado.
4. Probar carga inicial en desktop y movil.
5. Agregar presupuesto de bundle.

## 6. Checklist tecnico para corregir

- [ ] Corregir scope de empleados en `create/update`.
- [ ] Corregir scope de movimientos en `create/authorize/deliver/reject/discount`.
- [ ] Agregar pruebas de escrituras fuera de sucursal.
- [ ] Quitar fallback `dev-secret` en produccion.
- [ ] Exigir `WEB_ORIGIN` en produccion.
- [ ] Endurecer `docker-compose.yml` o documentarlo como solo desarrollo.
- [ ] Implementar secuencias atomicas de folios.
- [ ] Validar fechas con `@IsDateString` y helper central.
- [ ] Blindar endpoints `/purge`.
- [ ] Validar contenido real de imagenes.
- [ ] Lazy load de portales frontend.
- [ ] Optimizar logo.
- [ ] Agregar pipeline CI con typecheck, tests y build.

## 7. Fortalezas actuales

- Guards globales de JWT y roles en `AppModule`.
- `ValidationPipe` global con whitelist y `forbidNonWhitelisted`.
- Auditoria en acciones relevantes.
- Login throttle para admin, empleado y checador.
- Prisma con relaciones e indices basicos.
- Dockerfiles y Compose para despliegue.
- Pruebas existentes para scope de listados y contabilidad de nomina.
- Build y typecheck pasan actualmente.

## 8. Riesgo residual si no se corrige

Si el sistema se usa en operacion real sin corregir los puntos P0/P1:

- Un usuario operativo podria afectar empleados o movimientos fuera de su sucursal.
- Un despliegue mal configurado podria aceptar tokens firmados con secreto conocido.
- Requests concurrentes podrian generar folios duplicados.
- Una purga activada por error podria eliminar evidencia operativa.
- El frontend cargara mas lento en dispositivos modestos por bundle y logo pesados.

La correccion mas urgente es el alcance por sucursal en escrituras. Despues de eso, la prioridad debe ser configuracion segura de produccion y folios atomicos.
