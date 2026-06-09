Quiero agregar un módulo de reloj checador dentro del sistema actual de empleados, adelantos y consumos.

Debe reutilizar los empleados, sucursales, roles y autenticación existentes.

Crear una pantalla pública/controlada para tablet fija en la ruta /checador, diseñada para usarse únicamente como reloj checador. Esta pantalla no debe mostrar información sensible como ventas, adelantos, saldos, consumos, totales ni panel administrativo.

Flujo:

1. Mostrar empleados activos de la sucursal asignada al dispositivo.
2. El empleado selecciona su nombre.
3. Selecciona tipo de checada: Entrada o Salida.
4. Captura su PIN personal.
5. La cámara de la tablet toma una foto obligatoria.
6. El backend valida PIN, empleado activo, sucursal y dispositivo autorizado.
7. Se guarda el registro con empleado, sucursal, dispositivo, tipo de evento, fecha/hora local de Mexicali, foto/evidencia, IP/User-Agent y estado válido.
8. Mostrar confirmación visual simple.

Agregar modelo/tablas para:

- TimeClockDevice: dispositivo autorizado, nombre, sucursal, token, activo.
- TimeClockEntry: empleado, sucursal, dispositivo, tipo ENTRY/EXIT, fecha/hora, foto/evidencia, estado, notas, creadoPor.
- AttendanceShift o WorkSession: jornada activa calculada desde entrada hasta salida.
- AttendanceAdjustment: correcciones manuales con motivo, usuario que corrige y auditoría.

Reglas:

- Solo dispositivos autorizados pueden usar /checador.
- No permitir checar si el dispositivo no está registrado.
- No permitir salida si no existe entrada activa.
- No permitir doble entrada si ya hay turno activo.
- Permitir corrección manual solo a ADMIN/SUPERADMIN/ENCARGADO autorizado.
- Toda corrección debe quedar auditada.
- La foto es obligatoria.
- No usar reconocimiento facial en esta primera versión, solo foto como evidencia.

Integración con adelantos/consumos:

- Antes de permitir registrar adelantos o consumos de empleado, validar que el empleado tenga turno activo hoy.
- Si no tiene entrada activa o ya registró salida, bloquear el movimiento y mostrar mensaje: “El empleado no tiene turno activo registrado.”
- Registrar en auditoría cuando se bloquee un intento.

Panel admin:

- Vista de asistencia del día por sucursal.
- Estado actual: en turno / salió / sin checar.
- Historial por empleado.
- Vista de fotos de evidencia.
- Filtros por fecha, sucursal y empleado.
- Exportación a Excel.
- Correcciones manuales con motivo obligatorio.

Seguridad:

- El token del dispositivo no debe estar expuesto como variable editable por empleados.
- La pantalla /checador debe tener permisos mínimos.
- No mostrar datos sensibles.
- Validar todo en backend, no confiar en frontend.
- Usar la zona horaria local de Mexicali para los registros.
