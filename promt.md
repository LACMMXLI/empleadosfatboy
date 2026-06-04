Necesito implementar un módulo de nómina básica dentro del panel administrativo de la app de adelantos/movimientos.

No quiero una nómina fiscal completa. Quiero una nómina operativa interna para calcular cuánto se le debe pagar a cada empleado después de restar adelantos, consumos y movimientos administrativos.

IMPORTANTE:
El cálculo de nómina NO debe hacerse en el frontend.
El frontend solo debe mostrar datos y enviar solicitudes.
Toda validación, cálculo y protección debe hacerse en el backend.

OBJETIVO

Agregar al sistema una sección llamada “Nómina” dentro del panel administrativo.

La nómina debe calcular automáticamente:

Sueldo base del empleado
menos adelantos aprobados
menos consumos internos
menos cargos administrativos
menos penalizaciones
más ajustes positivos si existen
igual a neto a pagar

ESTRUCTURA GENERAL

Agregar datos laborales al empleado:

- Sueldo base
- Tipo de sueldo:
  - semanal
  - quincenal
  - diario

- Puesto
- Estatus activo/inactivo
- Fecha de ingreso

Estos datos deben editarse desde la vista administrativa de empleados.

No tocar la vista de empleados.

MÓDULO DE NÓMINA

Crear una nueva vista administrativa llamada “Nómina”.

Debe permitir:

- Seleccionar periodo de nómina.
- Ver empleados activos.
- Previsualizar cálculo de nómina.
- Generar nómina del periodo.
- Ver detalle por empleado.
- Consultar nóminas generadas anteriormente.

PERIODOS

La nómina debe manejar periodos con fecha de inicio y fecha de fin.

Ejemplo:
Periodo: 2026-06-01 al 2026-06-07

Cada periodo debe tener estado:

- BORRADOR
- GENERADA
- PAGADA
- CANCELADA

REGLA CRÍTICA:
No se debe poder generar dos nóminas para el mismo periodo.

Debe existir una protección a nivel backend y base de datos para impedir duplicados.

Implementar una restricción única por:

- fecha_inicio
- fecha_fin

o por un campo `period_key` generado, por ejemplo:
`2026-06-01_2026-06-07`

CÁLCULO BACKEND

Crear endpoint backend para calcular nómina.

El frontend debe enviar:

- fecha_inicio
- fecha_fin

El backend debe:

1. Buscar empleados activos.
2. Obtener sueldo base de cada empleado.
3. Buscar movimientos aprobados dentro del periodo.
4. Separar movimientos por tipo:
   - adelantos aprobados
   - consumos internos
   - cargos administrativos
   - penalizaciones
   - ajustes positivos
   - ajustes negativos

5. Calcular total de deducciones.
6. Calcular total de ajustes positivos.
7. Calcular neto a pagar.
8. Regresar el desglose completo.

Fórmula:

neto_a_pagar =
sueldo_base

- ajustes_positivos

* adelantos_aprobados
* consumos_internos
* cargos_administrativos
* penalizaciones
* ajustes_negativos

VALIDACIONES BACKEND

El backend debe validar:

- Que fecha_inicio sea menor o igual a fecha_fin.
- Que el periodo no esté duplicado.
- Que solo usuarios administradores puedan calcular/generar nómina.
- Que los empleados incluidos estén activos.
- Que los montos sean numéricos y mayores o iguales a 0.
- Que no se genere nómina si no hay empleados activos.
- Que no se genere una nómina si ya existe una con el mismo periodo.
- Que no se pueda modificar una nómina en estado PAGADA.
- Que no se pueda eliminar físicamente una nómina generada; solo cancelarla.
- Que la cancelación requiera motivo.
- Que todo cambio quede registrado en auditoría.

SEGURIDAD

Proteger todos los endpoints de nómina con autenticación y rol administrador.

El frontend nunca debe enviar el neto calculado como dato confiable.

El backend debe ignorar cualquier cálculo enviado desde frontend.

El backend debe recalcular siempre usando la base de datos.

BASE DE DATOS

Agregar modelos/tablas necesarios, por ejemplo:

Employee:

- salary_amount
- salary_type
- position
- employment_status
- hire_date

Payroll:

- id
- period_start
- period_end
- period_key
- status
- total_gross
- total_deductions
- total_adjustments
- total_net
- generated_by_admin_id
- generated_at
- paid_at
- cancelled_at
- cancel_reason
- created_at
- updated_at

PayrollItem:

- id
- payroll_id
- employee_id
- base_salary
- total_advances
- total_internal_consumption
- total_admin_charges
- total_penalties
- total_positive_adjustments
- total_negative_adjustments
- total_deductions
- net_pay
- created_at
- updated_at

Opcional si aplica:
PayrollItemMovement:

- id
- payroll_item_id
- movement_id

Esto sirve para dejar trazabilidad exacta de qué movimientos fueron incluidos en cada nómina.

PROTECCIÓN CONTRA DOBLE COBRO

Cuando se genera una nómina, los movimientos incluidos deben quedar marcados como incluidos en nómina o relacionados mediante PayrollItemMovement.

No deben volver a descontarse en otra nómina.

Implementar protección backend para que:

- Un movimiento no pueda estar relacionado con más de una nómina activa.
- Si una nómina se cancela, definir claramente si los movimientos quedan liberados para una nueva nómina.
- No incluir movimientos cancelados, rechazados o ya pagados.
- Solo incluir movimientos aprobados/confirmados.

ENDPOINTS SUGERIDOS

Crear endpoints administrativos:

GET /admin/payroll/preview?start=YYYY-MM-DD&end=YYYY-MM-DD

Debe regresar previsualización calculada desde backend sin guardar nómina.

POST /admin/payroll/generate

Body:

- period_start
- period_end

Debe calcular, validar duplicado, guardar Payroll, PayrollItems y relaciones con movimientos.

GET /admin/payroll

Lista de nóminas generadas.

GET /admin/payroll/:id

Detalle completo de una nómina.

POST /admin/payroll/:id/mark-paid

Marca una nómina como pagada.

POST /admin/payroll/:id/cancel

Body:

- reason

Cancela una nómina con motivo obligatorio.

UX ADMINISTRATIVA

Agregar en el menú administrativo una sección “Nómina”.

La vista debe ser limpia y sin exceso de scroll.

Estructura recomendada:

1. Encabezado:
   - Nómina
   - Botón “Nueva nómina”

2. Filtros:
   - Fecha inicio
   - Fecha fin
   - Botón “Previsualizar”

3. Resumen del periodo:
   - Total sueldos
   - Total deducciones
   - Total ajustes
   - Total neto a pagar

4. Tabla compacta por empleado:
   - Empleado
   - Sueldo base
   - Adelantos
   - Consumos
   - Cargos
   - Ajustes
   - Neto a pagar
   - Ver detalle

5. Acción:
   - Generar nómina

6. Historial:
   - Periodo
   - Estado
   - Total neto
   - Fecha generada
   - Acciones: ver detalle, marcar pagada, cancelar

No mezclar nómina con empleados, historial general ni movimientos administrativos.

Cada módulo debe seguir separado:

- Dashboard
- Empleados
- Aprobaciones
- Movimientos Administrativos
- Historial
- Nómina
- Configuración

REGLAS DE ESTADO

BORRADOR:

- Puede existir solo como previsualización si se decide guardar borrador.
- No obligatorio.

GENERADA:

- Nómina creada y bloqueada para evitar duplicados.

PAGADA:

- Nómina ya pagada.
- No se puede editar.
- No se puede cancelar sin lógica especial.
- No se pueden reutilizar movimientos incluidos.

CANCELADA:

- Nómina anulada.
- Requiere motivo.
- Debe quedar en historial.
- No eliminar registros.

AUDITORÍA

Registrar en auditoría:

- Quién generó la nómina.
- Cuándo se generó.
- Quién la marcó como pagada.
- Quién la canceló.
- Motivo de cancelación.
- Movimientos incluidos.
- Totales calculados.

PRUEBAS

Agregar pruebas o validaciones manuales para confirmar:

1. No se puede generar dos veces la misma nómina.
2. El cálculo se hace en backend.
3. El frontend no puede manipular el neto.
4. Solo administrador accede a nómina.
5. Los movimientos incluidos no se descuentan dos veces.
6. Una nómina pagada no se puede editar.
7. Una nómina cancelada queda en historial.
8. Empleados inactivos no aparecen en nueva nómina.
9. Los montos negativos o inválidos se rechazan.
10. El periodo inválido se rechaza.

CRITERIO DE ACEPTACIÓN

La implementación se considera correcta cuando:

- Existe una sección administrativa “Nómina”.
- El administrador puede previsualizar una nómina por periodo.
- El cálculo viene completamente del backend.
- El administrador puede generar una nómina.
- No se puede generar una nómina duplicada para el mismo periodo.
- Los movimientos incluidos quedan trazados.
- No se descuentan movimientos dos veces.
- Se puede marcar como pagada.
- Se puede cancelar con motivo.
- Todo queda protegido por rol administrador.
- La vista es compacta, ordenada y sin formularios innecesarios.
- No se modifica la vista de empleados.
