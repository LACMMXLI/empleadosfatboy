Desarrolla una aplicación web moderna para control de adelantos, préstamos, consumos internos y salidas de efectivo para empleados de un restaurante.

OBJETIVO

Crear un sistema de control y evidencia que elimine disputas sobre adelantos, consumos o salidas de efectivo. Todo movimiento debe quedar registrado con evidencia, autorizaciones y auditoría completa.

TECNOLOGÍAS

Frontend:

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- React Query
- React Hook Form
- Zod

Backend:

- Node.js
- NestJS
- Prisma ORM
- PostgreSQL

REQUISITOS GENERALES

- Diseño moderno y profesional.
- Responsive para computadora, tablet y celular.
- Tema oscuro elegante.
- Interfaz rápida y simple para uso diario.
- Sistema multiusuario.
- Sistema multisucursal.
- Auditoría completa.

ROLES

Administrador

- Acceso total.
- Gestiona usuarios.
- Gestiona empleados.
- Ve todos los movimientos.
- Cancela movimientos.
- Configura límites.

Encargado

- Registra movimientos.
- Autoriza movimientos dentro de límites definidos.
- Consulta reportes de su sucursal.

Cajero

- Registra movimientos.
- Consulta historial.
- No puede cancelar movimientos.

Empleado

- Consulta únicamente sus propios movimientos.
- Consulta saldo pendiente.
- Consulta historial personal.

MÓDULO DE EMPLEADOS

Campos:

- ID
- Nombre completo
- Código de empleado
- PIN personal
- Puesto
- Sucursal
- Teléfono
- Estado activo/inactivo

Funciones:

- Crear empleado
- Editar empleado
- Desactivar empleado
- Buscar empleado
- Historial completo

MÓDULO DE MOVIMIENTOS

Tipos de movimiento:

- Adelanto de sueldo
- Préstamo
- Consumo interno
- Bebidas
- Comida
- Salida de efectivo autorizada
- Ajuste administrativo

Campos:

- Folio único automático
- Empleado
- Tipo de movimiento
- Cantidad
- Motivo
- Fecha y hora
- Usuario que registra
- Usuario que autoriza
- Estado

Estados:

- Pendiente
- Autorizado
- Rechazado
- Cancelado
- Descontado
- Parcialmente descontado

FLUJO DE REGISTRO

1. Buscar empleado.
2. Seleccionar tipo de movimiento.
3. Capturar cantidad.
4. Capturar motivo.
5. Solicitar PIN del empleado.
6. Validar PIN.
7. Solicitar autorización.
8. Registrar evidencia.
9. Generar comprobante.
10. Guardar auditoría.

AUTORIZACIONES

Configurar reglas:

Ejemplo:

- Hasta $100 → Encargado
- $101 a $300 → Gerente
- Más de $300 → Administrador

Debe permitir configurar estos límites desde panel administrativo.

CONTROL DE CONSUMOS

Registrar:

- Producto consumido
- Cantidad
- Precio
- Fecha
- Empleado

Los consumos deben sumarse automáticamente al saldo pendiente del empleado.

SALDOS

Cada empleado debe tener:

- Total de adelantos
- Total de préstamos
- Total de consumos
- Total descontado
- Saldo pendiente actual

DASHBOARD

Tarjetas principales:

- Adelantos hoy
- Consumos hoy
- Salidas de efectivo hoy
- Pendiente por descontar
- Movimientos pendientes
- Movimientos autorizados

Gráficas:

- Adelantos por semana
- Adelantos por empleado
- Consumos por empleado
- Comparativo por sucursal

HISTORIAL

Filtros:

- Fecha
- Empleado
- Tipo
- Sucursal
- Estado
- Usuario que autorizó

Búsqueda instantánea.

Paginación.

Ordenamiento.

COMPROBANTES

Cada movimiento debe generar un comprobante digital con:

- Folio
- Fecha
- Hora
- Empleado
- Cantidad
- Tipo
- Motivo
- Usuario que registró
- Usuario que autorizó

Agregar texto:

"Confirmo que solicité y recibí este adelanto, préstamo, consumo o salida de efectivo y acepto los descuentos correspondientes cuando aplique."

AUDITORÍA

Registrar absolutamente todo:

- Creación
- Edición
- Cancelación
- Cambio de estado
- Cambio de límites
- Inicio de sesión

Guardar:

- Usuario
- Fecha
- Hora
- Acción
- Valor anterior
- Valor nuevo

Las cancelaciones nunca deben borrar registros.

Únicamente cambiar estado a CANCELADO.

REPORTES

Generar:

- Adelantos por empleado
- Adelantos por fecha
- Consumos por empleado
- Consumos por sucursal
- Saldos pendientes
- Movimientos cancelados
- Resumen semanal
- Resumen quincenal
- Resumen mensual

Exportar:

- PDF
- Excel

SEGURIDAD

- JWT
- Hash seguro de contraseñas
- Protección por roles
- Validación backend
- Validación frontend
- Rate limit
- Logs de acceso

BASE DE DATOS

Diseñar entidades completas para:

- Usuarios
- Roles
- Sucursales
- Empleados
- Movimientos
- TiposMovimiento
- Auditoria
- Configuracion
- Reportes

ENTREGABLE

Generar una aplicación completa, profesional y lista para producción, con arquitectura limpia, separación frontend/backend, buenas prácticas, validaciones completas, auditoría integral y base de datos diseñada para operar diariamente en restaurantes con múltiples empleados y sucursales.
