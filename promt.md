Se identificó una vulnerabilidad de alcance (scope) en el backend.

NO realices una auditoría general del proyecto.

Concéntrate únicamente en corregir el problema descrito a continuación.

PROBLEMA

En el módulo de movimientos existe riesgo de que los filtros enviados por el frontend sobrescriban las restricciones de acceso definidas por el usuario autenticado.

Archivo principal a revisar:

apps/api/src/movements/movements.service.ts

Especialmente el método:

buildWhere()

Según el análisis realizado, employeeId, branchId u otros filtros podrían eliminar o modificar restricciones de acceso aplicadas previamente por scopeForUser().

OBJETIVO

Garantizar que el scope del usuario autenticado nunca pueda ser sobrescrito por filtros enviados desde el frontend.

REGLAS

EMPLEADO

- Solo puede acceder a sus propios movimientos.

CAJERO

- Solo puede acceder a movimientos de su sucursal.

ENCARGADO

- Solo puede acceder a movimientos de su sucursal.

GERENTE

- Mantener la lógica actual.

ADMINISTRADOR

- Acceso completo.

REQUISITOS

1. Corregir buildWhere() para que los filtros del cliente no puedan eliminar restricciones de seguridad.

2. Revisar cualquier otro método relacionado con listados o búsquedas de movimientos que use filtros dinámicos.

3. Mantener compatibilidad con la API actual.

4. No modificar comportamiento funcional fuera de este problema.

5. Agregar pruebas que validen:

- Empleado no puede ver movimientos de otro empleado.
- Cajero no puede ver otra sucursal.
- Encargado no puede ver otra sucursal.
- Administrador puede ver todo.

ENTREGABLES

- Archivos modificados.
- Explicación técnica del fallo.
- Explicación técnica de la corrección.
- Casos de prueba ejecutados.
