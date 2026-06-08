Integra carga de imágenes con MinIO en mi sistema.

Contexto:

- Mi sistema tiene frontend + backend NestJS + PostgreSQL en Coolify.
- El frontend actualmente consume el backend usando rutas /api.
- Ya tengo MinIO corriendo en Coolify.
- Ya pude entrar al panel de MinIO por IP local:9001.
- Ya creé un bucket llamado: fatboy-file
- No quiero que el frontend se conecte directo a MinIO.
- El flujo correcto debe ser:
  Frontend → /api → Backend NestJS → MinIO
- PostgreSQL solo debe guardar referencias de las imágenes, no guardar archivos binarios.

Objetivo:
Permitir subir imágenes desde la aplicación para usarlas en incidencias, empleados, checklists y evidencias.

Tareas:

1. Revisar la estructura actual del backend NestJS.
2. Crear un módulo FilesModule.
3. Configurar conexión a MinIO usando AWS SDK v3 compatible con S3.
4. Leer estas variables de entorno:

S3_ENDPOINT=http://NOMBRE_INTERNO_DEL_SERVICIO_MINIO:9000
S3_ACCESS_KEY=ACCESS_KEY_DE_MINIO
S3_SECRET_KEY=SECRET_KEY_DE_MINIO
S3_BUCKET=fatboy-file
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true

5. Detectar cuál es el hostname interno correcto del servicio MinIO dentro de Docker/Coolify. No usar 127.0.0.1.
6. Crear endpoint:

POST /api/files/upload

Debe recibir multipart/form-data con un archivo llamado file.

7. Validar:

- Solo permitir image/jpeg, image/png, image/webp
- Máximo 5 MB
- Rechazar cualquier otro archivo

8. Guardar los archivos en MinIO con estructura:

incidencias/{branchId}/{year}/{month}/{uuid}.{ext}
empleados/{employeeId}/{uuid}.{ext}
checklists/{branchId}/{type}/{year}/{month}/{uuid}.{ext}

9. Crear modelo Prisma FileAsset con campos:

- id
- bucket
- key
- originalName
- mimeType
- size
- module
- entityId
- branchId
- uploadedByUserId
- createdAt

10. Al subir una imagen:

- Guardarla en MinIO
- Guardar su referencia en PostgreSQL
- Retornar el id del archivo y una URL interna para consultarlo

11. Crear endpoint:

GET /api/files/:id

Este endpoint debe:

- Buscar el archivo en PostgreSQL
- Validar permisos del usuario
- Leerlo desde MinIO
- Devolver la imagen al frontend

12. Crear endpoint:

DELETE /api/files/:id

Debe:

- Eliminar el objeto de MinIO
- Eliminar o marcar como eliminado el registro en PostgreSQL

13. No hacer público el bucket de MinIO.
14. No exponer access key ni secret key al frontend.
15. Actualizar .env.example con las variables necesarias.
16. Probar subiendo una imagen real desde el frontend.
17. No romper los módulos existentes.
18. Entregar resumen de archivos modificados y cómo probarlo.
