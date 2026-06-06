Analiza el backend NestJS completo y corrige cualquier vulnerabilidad relacionada con permisos, alcance de datos (scope), sucursales y acceso entre empleados.

IMPORTANTE:
No hagas cambios superficiales. Realiza una auditoría completa de autorización y acceso a datos en todo el proyecto.

OBJETIVO PRINCIPAL

Garantizar que ningún usuario pueda consultar, listar o modificar información fuera de su alcance autorizado, incluso si manipula manualmente peticiones HTTP, parámetros, filtros o payloads.

====================================================
FASE 1 - AUDITORÍA COMPLETA
====================================================

Revisa exhaustivamente:

- Guards
- Decoradores de roles
- JWT
- Servicios
- Controladores
- Prisma queries
- Métodos buildWhere()
- Filtros dinámicos
- DTOs
- Endpoints administrativos
- Endpoints de empleados
- Endpoints de movimientos
- Endpoints de nómina
- Endpoints de configuración

Identifica cualquier punto donde el frontend pueda influir en filtros que permitan escapar del scope autorizado.

====================================================
FASE 2 - CORRECCIÓN DEL SCOPE
====================================================

Implementa una función centralizada reutilizable para determinar el alcance permitido del usuario autenticado.

Ejemplo conceptual:

getUserScope(user)

La función debe devolver las restricciones obligatorias que se aplicarán SIEMPRE en todas las consultas.

Nunca confiar en filtros enviados desde frontend.

Las restricciones del scope deben aplicarse en backend antes de ejecutar cualquier consulta Prisma.

====================================================
REGLAS DE ACCESO
====================================================

ROL EMPLEADO

- Solo puede consultar sus propios movimientos.
- Solo puede consultar su propio saldo.
- Solo puede consultar su propio historial.
- No puede consultar otros empleados.
- No puede consultar movimientos ajenos.
- No puede consultar información de sucursal.

ROL CAJERO

- Solo puede consultar empleados de su sucursal.
- Solo puede consultar movimientos de su sucursal.
- No puede consultar datos de otras sucursales.

ROL ENCARGADO

- Solo puede consultar empleados de su sucursal.
- Solo puede consultar movimientos de su sucursal.
- No puede consultar otras sucursales.

ROL GERENTE

- Mantener la lógica actual del sistema.
- Verificar que no existan fugas de información.

ROL ADMINISTRADOR

- Acceso completo.

====================================================
MOVEMENTS SERVICE
====================================================

Revisa completamente:

apps/api/src/movements/movements.service.ts

Especialmente:

- buildWhere()
- filtros dinámicos
- listados
- búsquedas
- exportaciones
- consultas históricas

Verifica que:

- employeeId enviado por frontend jamás elimine restricciones del usuario.
- branchId enviado por frontend jamás elimine restricciones del usuario.
- status enviado por frontend jamás elimine restricciones del usuario.
- ningún campo opcional pueda sobrescribir el scope.

Si existe riesgo de sobrescritura, rediseñar la construcción del WHERE.

====================================================
EMPLOYEES MODULE
====================================================

Auditar completamente:

GET /employees

GET /employees/:id

GET /employees/:id/balance

y cualquier endpoint adicional relacionado con empleados.

Verificar:

- Roles requeridos.
- Restricciones por sucursal.
- Restricciones por empleado.
- Acceso a saldos.
- Acceso a movimientos relacionados.

Ningún usuario debe poder consultar información fuera de su alcance.

====================================================
FASE 3 - HARDENING
====================================================

Agregar validaciones defensivas.

Aunque el frontend envíe:

employeeId arbitrario
branchId arbitrario
ids manipulados
filtros falsificados

El backend debe ignorarlos cuando violen el scope permitido.

La seguridad debe depender exclusivamente del usuario autenticado y sus permisos.

====================================================
FASE 4 - TESTS
====================================================

Crear pruebas automatizadas para validar:

Caso 1:
Empleado intenta consultar movimientos de otro empleado.
Resultado esperado:
403 o datos filtrados correctamente.

Caso 2:
Cajero intenta consultar otra sucursal.
Resultado esperado:
Acceso denegado.

Caso 3:
Encargado intenta consultar otra sucursal.
Resultado esperado:
Acceso denegado.

Caso 4:
Administrador consulta cualquier sucursal.
Resultado esperado:
Acceso permitido.

Caso 5:
Manipulación manual de employeeId.
Resultado esperado:
No rompe el scope.

Caso 6:
Manipulación manual de branchId.
Resultado esperado:
No rompe el scope.

====================================================
ENTREGABLES
====================================================

1. Lista completa de vulnerabilidades encontradas.

2. Archivos modificados.

3. Explicación técnica de cada vulnerabilidad.

4. Explicación técnica de la solución implementada.

5. Pruebas realizadas.

6. Riesgos residuales encontrados.

7. Confirmación explícita de que ningún filtro enviado por frontend puede sobrescribir el scope impuesto por backend.
