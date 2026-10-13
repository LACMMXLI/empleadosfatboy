# Instalación limpia del monorepo

Esta guía reconstruye las dependencias después de borrar las carpetas `node_modules`.

## Requisitos

- Node.js `22.22.3`.
- npm `10.9.8`.
- Acceso al registro de npm.

El repositorio declara estas versiones en `.nvmrc`, `package.json` y los Dockerfiles. No use Node 25 ni npm 11 para una instalación reproducible de este proyecto.

## Instalación en Windows

1. Instale nvm-windows si aún no está disponible en la computadora.
2. Abra PowerShell en la raíz del repositorio:

   ```powershell
   cd "C:\Sistema de adelantos y reloj checador de  fatboy"
   nvm install 22.22.3
   nvm use 22.22.3
   node --version
   npm --version
   ```

3. Confirme que las versiones mostradas sean `v22.22.3` y `10.9.8`.
4. Reconstruya todas las dependencias con el lockfile existente:

   ```powershell
   npm ci --workspaces --include-workspace-root
   ```

`npm ci` instala exactamente las versiones protegidas por `package-lock.json`. No ejecute `npm install`, no borre `package-lock.json` y no cree lockfiles dentro de `apps/api` ni `apps/web`.

## Estructura de dependencias

El repositorio usa npm workspaces:

- Raíz: orquestación compartida.
- `apps/api`: API NestJS.
- `apps/web`: frontend Vite/React.

Existe un solo lockfile válido: `package-lock.json` en la raíz. El único comando de instalación se ejecuta desde la raíz y reconstruye los tres módulos.

## Verificación posterior

Después de instalar, ejecute:

```powershell
npm run typecheck
npm run build
```

Para levantar el desarrollo:

```powershell
npm run dev
```

## Instalación en Docker

Los Dockerfiles de API y web ya usan `node:22.22.3-bookworm-slim` y ejecutan `npm ci`; no se requieren lockfiles adicionales.

