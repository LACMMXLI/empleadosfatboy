# Analisis completo del proyecto Fatboy POS / Control de Empleados

Fecha de revision: 2026-06-06  
Carpeta revisada: `C:\Nueva carpeta (2)`  
Metodo: revision estatica del codigo fuente, configuracion ejecutable, Prisma, frontend y backend. No se uso la documentacion existente como base del diagnostico.

## 1. Resumen ejecutivo

Este checkout no contiene el POS completo descrito en las instrucciones generales del proyecto. El codigo disponible implementa principalmente un sistema web de control de empleados, movimientos, adelantos, consumos internos, entregas, liquidaciones y nomina.

La estructura real es:

- Backend: NestJS en `apps/api`.
- Frontend: React + Vite + TypeScript + Tailwind en `apps/web`.
- Base de datos: PostgreSQL + Prisma en `apps/api/prisma/schema.prisma`.
- Despliegue web: Docker/Nginx/Postgres.
- PWA: portal administrativo y portal empleado.

No encontre implementacion real, en este checkout, de:

- Electron desktop.
- Socket.IO realtime.
- impresion termica.
- apertura de caja registradora.
- ventas de restaurante.
- mesas/piso.
- cocina/KDS.
- ordenes/comandas.
- clientes/delivery.
- servicio Windows del backend.

Por lo tanto, el estado del sistema debe entenderse como un modulo operativo de empleados/nomina, no como un POS de restaurante completo listo para operar caja, cocina e impresion.

## 2. Estado tecnico actual

El proyecto esta en un estado funcional razonable para su alcance actual:

- `npm run typecheck` paso en backend y frontend.
- `npm run prisma:status` reporto 4 migraciones y esquema de base de datos actualizado contra la base configurada.
- Prisma tiene modelos coherentes para sucursales, usuarios, empleados, movimientos, nomina, reglas de autorizacion, configuracion y auditoria.
- El backend usa guardias globales de JWT y roles.
- El frontend consume la API mediante React Query y separa sesion administrativa de sesion de empleado.
- El despliegue Docker exige `DATABASE_URL` y `JWT_SECRET` en el entrypoint de API.

El sistema, sin embargo, tiene riesgos importantes antes de considerarlo robusto para uso real en restaurante.

## 3. Arquitectura real observada

### Backend

Modulos principales:

- `AuthModule`: login administrativo, JWT, `me`.
- `EmployeesModule`: CRUD de empleados, consulta de saldo.
- `MovementsModule`: movimientos, autorizaciones, entregas, cancelaciones, liquidaciones y auditoria.
- `EmployeePortalModule`: login por telefono/PIN, solicitudes, saldo e historial de empleado.
- `PayrollModule`: previsualizacion, generacion, pago y cancelacion de nomina.
- `ConfigurationModule`: configuracion global, precio de bebida, reglas de autorizacion, sucursales.
- `AdminUsersModule`: administracion de usuarios administrativos.
- `AuditModule`: registro de auditoria.

### Frontend

El frontend esta concentrado casi por completo en `apps/web/src/App.tsx`, con aproximadamente 2,857 lineas. Ahi viven:

- enrutamiento manual `/`, `/admin`, `/employee`;
- login administrativo;
- login de empleado;
- shell administrativo;
- dashboard;
- aprobaciones;
- entregas;
- movimientos administrativos;
- historial;
- nomina;
- empleados;
- configuracion;
- portal movil del empleado.

Esto funciona para un MVP, pero ya es una deuda tecnica fuerte.

### Datos

El modelo de datos esta bastante enfocado en empleados y movimientos financieros internos:

- `Branch`
- `User`
- `Employee`
- `Movement`
- `Payroll`
- `PayrollItem`
- `PayrollItemMovement`
- `AuthorizationRule`
- `SystemConfig`
- `AuditLog`

No existen modelos de POS completo como `Order`, `OrderItem`, `Table`, `Ticket`, `Printer`, `CashShift`, `KitchenTicket`, `Customer`, etc.

## 4. Fortalezas del sistema

### 4.1 Backend como fuente de verdad

Muchas reglas importantes estan en backend:

- validacion de PIN de empleado;
- determinacion de precio de bebida desde `SystemConfig`;
- reglas de autorizacion por monto/rol;
- calculo de saldos;
- generacion de nomina;
- cambios de estado de movimientos;
- auditoria.

Esto va alineado con el principio de que el backend debe ser la fuente de verdad.

### 4.2 Buen uso de Prisma

El esquema tiene indices y restricciones utiles:

- `User.email` unico.
- `Employee.phone` unico.
- `Movement.folio` unico.
- `Payroll.periodKey` unico.
- `PayrollItem` unico por nomina/empleado.
- `PayrollItemMovement` unico por movimiento.
- indices sobre empleado, sucursal, estado, tipo y fechas.

Esto ayuda a consistencia y rendimiento.

### 4.3 Seguridad base existente

Hay guardia global de JWT y guardia de roles:

- `JwtAuthGuard` verifica token y usuario activo.
- `RolesGuard` aplica jerarquia de roles.
- `helmet`, `compression`, rate limit y `ValidationPipe` global estan activados.
- DTOs usan `class-validator`.
- passwords y PIN se guardan con bcrypt.

### 4.4 Auditoria

El sistema registra cambios relevantes en `AuditLog`:

- login;
- creacion/edicion de empleados;
- movimientos;
- cambios de estado;
- liquidaciones;
- nomina;
- configuracion.

Para un sistema laboral/financiero interno, esta es una fortaleza importante.

### 4.5 Despliegue web razonable

Hay Dockerfiles separados para API y web, Nginx sirve el frontend y proxya `/api/` al backend. El entrypoint de API espera base de datos, aplica migraciones y levanta `dist/main.js`.

## 5. Fallos y riesgos importantes

### Critico 1: fuga de alcance por sucursal/empleado en listado de movimientos

Archivo: `apps/api/src/movements/movements.service.ts`

El metodo `buildWhere` hace:

- primero aplica `...this.scopeForUser(user)`;
- despues asigna `employeeId: filters.employeeId`;
- despues asigna `branchId: filters.branchId`;
- despues asigna `status`.

Como las propiedades posteriores pisan las anteriores, un usuario `EMPLEADO`, `CAJERO` o `ENCARGADO` puede perder el filtro de alcance si no manda filtro o si manda otro filtro. En Prisma, `undefined` se ignora, por lo que el scope original puede desaparecer.

Impacto probable:

- un empleado podria listar movimientos de otros empleados;
- un cajero/encargado podria ver movimientos de otras sucursales;
- el frontend podria no exponerlo visualmente, pero la API si queda vulnerable.

Este es el fallo mas serio del backend revisado.

### Critico 2: empleados sin scope por rol/sucursal

Archivo: `apps/api/src/employees/employees.controller.ts` y `apps/api/src/employees/employees.service.ts`

Los endpoints `GET /employees`, `GET /employees/:id` y `GET /employees/:id/balance` no declaran `@Roles` ni reciben el usuario autenticado para aplicar alcance. Cualquier usuario autenticado puede consultar empleados, detalles, movimientos recientes incluidos en `get`, y saldos, dependiendo del endpoint.

Impacto:

- exposicion de informacion laboral/financiera entre sucursales;
- posible acceso de empleados a informacion de otros empleados;
- fuga de historial de movimientos por `get(id)`.

### Critico 3: nomina no descuenta ni libera movimientos correctamente

Archivo: `apps/api/src/payroll/payroll.service.ts`

La generacion de nomina crea `Payroll`, `PayrollItem` y `PayrollItemMovement`, pero los movimientos incluidos siguen con `status: AUTHORIZED`.

Riesgos:

- el dashboard y saldos pueden seguir contando como deuda movimientos ya incluidos en nomina;
- `markPaid` solo marca la nomina como pagada, pero no cambia estado de movimientos a `DISCOUNTED`;
- `cancel` cancela la nomina, pero no elimina/libera enlaces `PayrollItemMovement`, por lo que esos movimientos pueden quedar bloqueados para futuras nominas por `payrollLinks: { none: {} }`;
- se puede crear inconsistencia contable entre nomina, saldo del empleado y movimientos visibles.

Antes de usar nomina en produccion, este flujo debe definirse con precision: generar, pagar y cancelar deben tener efectos contables claros sobre los movimientos.

### Critico 4: no existe el POS completo en este codigo

Aunque el proyecto se describe como Fatboy POS profesional, en este checkout no hay modulos de venta, impresion, Electron, Socket.IO, caja, cocina, mesas ni ordenes.

Impacto:

- no puede operar como POS de restaurante completo;
- no puede imprimir tickets termicos desde Electron;
- no puede abrir caja registradora;
- no tiene realtime para cocina/caja;
- no tiene backend Windows Service.

Si este repo pretende reemplazar al POS completo, esta incompleto. Si pretende ser un modulo independiente de empleados/nomina, el alcance esta bien encaminado pero debe nombrarse y desplegarse como tal.

## 6. Riesgos altos

### Alto 1: folios con condicion de carrera

Archivo: `apps/api/src/movements/movements.service.ts`

`nextFolio()` calcula el folio contando movimientos del dia y sumando 1. Bajo dos solicitudes simultaneas, ambas pueden obtener el mismo contador y generar el mismo folio. La restriccion unica en BD evitara duplicidad, pero una de las solicitudes fallara.

Lo mismo aplica a `nextSettlementTicketNumber()`, que cuenta `AuditLog` para generar ticket de liquidacion.

Recomendacion:

- usar secuencia transaccional, contador por dia en tabla separada, retry controlado ante `P2002`, o folio con sufijo no colisionable.

### Alto 2: `JWT_SECRET` inseguro por fallback

Archivos:

- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/auth/jwt-auth.guard.ts`
- `apps/api/src/employee-portal/employee-portal.service.ts`

El codigo usa `JWT_SECRET ?? "dev-secret"`. En produccion esto no debe existir. Aunque Docker entrypoint exige `JWT_SECRET`, localmente o en otro modo de arranque podria levantarse con secreto predecible.

Recomendacion:

- fallar el arranque si `JWT_SECRET` no existe fuera de desarrollo;
- evitar fallback comun entre admin y portal empleado.

### Alto 3: CORS abierto si falta `WEB_ORIGIN`

Archivo: `apps/api/src/main.ts`

`origin: webOrigin || true` abre CORS a cualquier origen si no se configura `WEB_ORIGIN`.

Recomendacion:

- en produccion exigir origen explicito;
- permitir `true` solo en modo desarrollo controlado.

### Alto 4: movimientos definidos pero no alcanzables desde UI/API normal

El enum Prisma incluye `LOAN`, `CASH_OUT`, `ADMIN_SALARY_ADVANCE`, `ADMIN_LOAN`, `FOOD`, pero las listas permitidas en servicios y frontend dejan varios fuera.

Ejemplos:

- `standardMovementKinds` no incluye `LOAN`, `CASH_OUT` ni `FOOD`.
- `administrativeKinds` no incluye `ADMIN_SALARY_ADVANCE` ni `ADMIN_LOAN`.
- el dashboard calcula `cashOutToday`, pero no se ve un flujo real para crear `CASH_OUT`.

Esto genera riesgo de producto incompleto o reglas inconsistentes.

### Alto 5: filtro de fechas inconsistente en historial

Archivo: `apps/api/src/movements/movements.service.ts`

El listado general usa `lte: new Date(filters.to)`, lo que normalmente representa el inicio del dia. Eso puede excluir movimientos ocurridos durante el dia seleccionado. En cambio, liquidaciones usan `lt: nextDay(to)`, que es la forma correcta para incluir todo el dia.

Recomendacion:

- unificar filtros por fecha usando inicio de dia y siguiente dia exclusivo.

### Alto 6: tokens en `localStorage`

Archivo: `apps/web/src/lib/api.ts`

Los tokens admin y empleado se guardan en `localStorage`. Esto es simple y funcional, pero aumenta impacto ante XSS porque el token queda accesible desde JavaScript.

Recomendacion:

- minimizar superficie XSS;
- considerar cookies HttpOnly si el despliegue y arquitectura lo permiten;
- implementar logout/expiracion global mas robusta.

## 7. Riesgos medios

### Medio 1: frontend monolitico

Archivo: `apps/web/src/App.tsx`

`App.tsx` concentra demasiada responsabilidad. Esto dificulta:

- pruebas por pantalla;
- mantenimiento;
- cambios visuales seguros;
- control de renders;
- separacion entre UI, formularios y reglas de presentacion.

Recomendacion:

- dividir por features: `admin`, `employee-portal`, `payroll`, `movements`, `employees`, `configuration`;
- extraer hooks de queries/mutations;
- mover constantes compartidas a archivos propios.

### Medio 2: invalidaciones muy amplias de React Query

Archivo: `apps/web/src/App.tsx`

Hay al menos un `queryClient.invalidateQueries()` sin `queryKey` especifica en movimientos administrativos. Esto puede disparar refetches innecesarios y afectar respuesta en operacion continua.

Recomendacion:

- invalidar solo `movements`, `dashboard`, `employees`, `payrolls` o `employeePortal` segun corresponda.

### Medio 3: falta realtime real

No hay Socket.IO, WebSocket, EventSource ni polling configurado. Las pantallas dependen de React Query y acciones manuales.

Impacto:

- aprobaciones, entregas y portal empleado pueden quedar desactualizados hasta que haya refetch;
- para operacion rapida en caja, esto puede sentirse lento o inconsistente.

### Medio 4: PWA basica sin estrategia de datos offline

Los service workers cachean shell, assets y manifiestos, pero no hay estrategia de sincronizacion offline para solicitudes ni manejo de API offline.

Esto esta bien para instalabilidad, pero no para operacion offline confiable.

### Medio 5: reglas de autorizacion solo se crean, no se editan/desactivan

`ConfigurationService` permite crear reglas, pero no actualizar, desactivar o validar traslapes. Con el tiempo puede haber reglas superpuestas o reglas viejas activas.

Recomendacion:

- agregar administracion completa de reglas;
- validar rangos solapados por tipo/monto;
- auditar activacion/desactivacion.

### Medio 6: paginacion limitada

Varios servicios usan `take: 50`, `take: 100` o `take: 150` sin cursor/paginacion real.

Impacto:

- datos historicos pueden desaparecer de la vista;
- en restaurantes con uso constante, historial y auditoria creceran rapido.

## 8. Riesgos bajos y deuda tecnica

### Bajo 1: labels de movimientos confusos

En frontend, `ADMIN_ADJUSTMENT` aparece como "Descuento administrativo" y `ADMIN_CHARGE` como "Ajuste manual", mientras backend calcula `ADMIN_ADJUSTMENT` como ajuste negativo y `BALANCE_CORRECTION` como positivo.

Esto puede causar errores operativos si un usuario administrativo elige el tipo incorrecto.

### Bajo 2: rutas manuales sin router

El frontend maneja rutas con `window.history.pushState` y `window.location.pathname`. Funciona para tres rutas, pero escala mal si se agregan mas vistas.

### Bajo 3: configuracion visual muy oscura

La interfaz esta fuertemente orientada a dark/cyan/violeta. Si el objetivo de producto es POS comercial calido y operativo, esta identidad visual podria no coincidir con la direccion deseada.

### Bajo 4: uso de `any`

Hay usos puntuales de `any`, por ejemplo en PWA install prompt y casting de DTO de empleado. No rompen el sistema, pero reducen seguridad de tipos.

## 9. Mejoras prioritarias recomendadas

### Prioridad 1: cerrar seguridad y scope

1. Corregir `buildWhere` para que filtros del cliente no puedan pisar el scope del usuario.
2. Aplicar scope por usuario/sucursal a empleados, detalles y balances.
3. Agregar pruebas unitarias o e2e para roles `EMPLEADO`, `CAJERO`, `ENCARGADO`, `GERENTE`, `ADMINISTRADOR`.
4. Exigir `JWT_SECRET` seguro fuera de desarrollo.
5. Cerrar CORS en produccion.

### Prioridad 2: corregir consistencia contable de nomina

1. Definir que pasa con movimientos al generar nomina.
2. Definir que pasa al pagar nomina.
3. Definir que pasa al cancelar nomina.
4. Evitar que saldos/dashboard sigan contando movimientos ya procesados.
5. Liberar o revertir `PayrollItemMovement` si una nomina se cancela.

### Prioridad 3: completar o recortar el alcance del producto

Hay que decidir formalmente:

- si este repo es solo `Fatboy Control Empleados`;
- o si debe crecer hasta ser el POS completo.

Si debe ser POS completo, faltan modulos principales:

- ventas;
- productos/menu;
- ordenes;
- mesas;
- cocina;
- caja/cortes;
- pagos;
- tickets;
- Electron;
- impresoras;
- caja registradora;
- realtime.

Si no debe ser POS completo, conviene ajustar nombre, navegacion y despliegue para no confundirlo con el sistema principal.

### Prioridad 4: dividir frontend por modulos

Separar `App.tsx` en:

- `routes`;
- `layouts`;
- `features/admin`;
- `features/employee-portal`;
- `features/movements`;
- `features/payroll`;
- `features/employees`;
- `features/configuration`;
- `hooks/api`;
- `constants`.

Esto no debe hacerse como rediseño visual, sino como refactor controlado con typecheck y pruebas de flujo.

### Prioridad 5: mejorar rendimiento operativo

1. Reemplazar invalidaciones globales por invalidaciones especificas.
2. Agregar paginacion/cursor.
3. Agregar realtime o polling controlado para aprobaciones/entregas.
4. Evitar cargas grandes de historiales sin filtros.
5. Medir renderizado del `App.tsx` despues de dividir pantallas.

## 10. Estado por area

| Area | Estado | Comentario |
|---|---|---|
| Backend base | Bueno | NestJS modular, Prisma, validacion, roles y auditoria. |
| Modelo de datos | Bueno para empleados/nomina | No cubre POS completo. |
| Seguridad | Media | Buen inicio, pero scope de datos y secretos requieren correccion. |
| Nomina | Riesgosa | Genera nomina, pero efectos contables sobre movimientos no estan cerrados. |
| Frontend admin | Funcional con deuda | Muy monolitico, muchas responsabilidades en `App.tsx`. |
| Portal empleado | Funcional | Login por telefono/PIN, solicitudes, saldo, historial y PWA. |
| Realtime | Ausente | No hay Socket.IO/WebSocket. |
| Impresion/Electron | Ausente | No hay Electron ni flujo de impresion termica. |
| Despliegue web | Aceptable | Docker/Nginx/Postgres presentes. |
| POS restaurante completo | Incompleto | No existen ventas, mesas, cocina, caja ni tickets. |

## 11. Conclusion

El codigo tiene una base seria para un modulo de control de empleados, movimientos internos, adelantos, consumos y nomina. La arquitectura backend es mejor que la de un prototipo simple: hay validacion, roles, auditoria, Prisma, migraciones y despliegue.

El problema principal es de alcance y consistencia:

- como POS completo, el sistema esta muy incompleto;
- como modulo de empleados/nomina, esta avanzado pero necesita corregir fallos criticos de permisos y contabilidad;
- el frontend funciona, pero ya necesita modularizacion antes de seguir creciendo.

Mi evaluacion general:

- Estado actual como modulo de empleados: 70% funcional.
- Estado actual como POS profesional completo: 20% o menos.
- Riesgo para produccion real sin correcciones: alto.
- Mejor siguiente paso: corregir permisos/scope y nomina antes de agregar nuevas funciones.

## 12. Verificaciones realizadas

Comandos ejecutados sin modificar codigo fuente:

```powershell
npm run typecheck
npm run prisma:status
```

Resultados:

- TypeScript backend: correcto.
- TypeScript frontend: correcto.
- Prisma migrate status: esquema actualizado contra la base configurada.
- Advertencia Prisma: `package.json#prisma` esta deprecado y debera migrarse a `prisma.config.ts` antes de Prisma 7.
