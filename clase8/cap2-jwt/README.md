# Biblioteca — Capítulo 2: Autenticación y autorización con JWT

API REST de una biblioteca universitaria con tres recursos (**libros**, **socios** y **préstamos**) y datos en memoria, asegurada con `@nestjs/authentication` mediante tokens JWT, control de acceso por roles y rotación de *refresh tokens*.

## Uso

```bash
npm install
npm run start:dev      # http://localhost:3000
npm test               # tests unitarios (src/**/*.spec.ts)
npm run test:e2e       # tests e2e (test/*.e2e-spec.ts)
```

Requiere Node.js 22.22 o superior.
En Windows PowerShell puede ejecutarse `npm.cmd test` si la política de ejecución restringe `npm.ps1`.

### Variables de entorno

| Variable | Descripción | Valor por defecto (desarrollo / e2e) |
|---|---|---|
| `JWT_SECRET` | Clave HMAC-SHA256 para firmar y verificar tokens (mínimo 32 bytes; obligatoria en producción) | Respaldo local en dev / definido en `test/setup-env.ts` |
| `JWT_TTL` | Tiempo de vida del *access token* (`15m`, `50ms`, milisegundos, etc.) | `15m` |
| `JWT_ISSUER` | Emisor (`iss`) incluido y validado en los JWT | `https://biblioteca.uni.edu` |

---

## Qué se implementó (por consigna)

### 1. Contraseñas hasheadas y login con JWT (`src/socios/`, `src/auth/`)

- **Registro de socios (`POST /socios`):** se agregaron los campos `contrasena` (mínimo 6 caracteres) y `rol` (`'socio'` o `'bibliotecario'`, por defecto `'socio'`) en `CrearSocioDto`.
- **Almacenamiento seguro:** `SociosService` hashea la contraseña con `PasswordHasher` (`scrypt` + sal) antes de guardarla en `contrasenaHash`. Todas las respuestas de socios pasan por `sinContrasena()` para omitir `contrasenaHash`.
- **Login (`POST /auth/login`):** `AuthController` verifica la contraseña con `hasher.verify()`. Si es válida, emite un par de tokens con `TokenService.issue(String(socio.id), ...)`:
  - `accessToken`: JWT firmado con HS256 cuyo payload incluye `sub` (id del socio), `email`, `rol`, `iss` (emisor) y `exp` (calculado según `JWT_TTL`).
  - `refreshToken`: token opaco de vida larga para renovar la sesión.

### 2. Protección global por defecto (`src/app.module.ts`)

- Se configuró `AuthenticationModule.forRootAsync(...)` en `AppModule`, lo que registra el guard global `AuthenticationGuard` en toda la aplicación: **cualquier ruta nueva o existente queda protegida automáticamente** (`401 Unauthorized` si falta el header `Authorization: Bearer <token>` o si el token es inválido/vencido).
- `JwtAuth` (`src/auth/jwt-auth.provider.ts`) extiende `JwtBearerProvider`, verifica la firma/claims del token y valida en `SociosService` que el socio siga existiendo.
- Se marcaron como `@Public()` únicamente:
  - `GET /salud` (`src/salud/salud.controller.ts`)
  - `POST /socios` (`src/socios/socios.controller.ts`)
  - `POST /auth/login` y `POST /auth/refresh` (`src/auth/auth.controller.ts`)

### 3. Autorización por roles y privacidad de préstamos (`src/auth/`, `src/libros/`, `src/prestamos/`)

- **Mecanismo de roles (`@Roles` + `RolesInterceptor`):**
  - `@nestjs/authentication` puebla `AuthenticationContext` en la fase de **interceptores** (que corren *después* de los guards). Por eso se implementó `RolesInterceptor` como `APP_INTERCEPTOR` global junto con el decorador `@Roles(...roles)` y `Reflector`.
  - Si la ruta exige un rol y el usuario autenticado no lo tiene, responde `403 Forbidden`.
- **Operaciones exclusivas de `'bibliotecario'`:**
  - `POST /libros`, `PATCH /libros/:id`, `DELETE /libros/:id`
  - `GET /prestamos/vencidos`
- **Aislamiento de préstamos para `'socio'`:**
  - `GET /prestamos` devuelve solo los préstamos del socio autenticado (el bibliotecario ve todos).
  - `GET /prestamos/:id` y `POST /prestamos/:id/devolucion` verifican la pertenencia del préstamo. Si un socio intenta consultar o devolver un préstamo ajeno, `PrestamosService` lanza exactamente el mismo `404 NotFoundException` que si no existiera, evitando revelar si ese ID existe.

### 4. Socio desde el token y origen del rol (`src/prestamos/`, `src/auth/`)

- **Identidad al prestar:** se eliminó `socioId` de `CrearPrestamoDto`. En `POST /prestamos`, `PrestamosController` obtiene el usuario autenticado con `@CurrentUser()` y pasa `usuario.id` al servicio. Como el `ValidationPipe` tiene `forbidNonWhitelisted: true`, enviar `socioId` en el body también se rechaza con `400`.

#### ¿De dónde se toma el rol que se autoriza?

Aunque el JWT incluye el `rol` en su payload para que los clientes puedan leer el perfil, **al autorizar cada petición el rol se toma desde la base de datos en memoria y no desde el token**.

`JwtAuth.validate({ sub })` consulta a `SociosService` en cada petición autenticada y coloca la entidad actualizada en `AuthenticationContext`, desde donde `RolesInterceptor` lee el `rol`.

#### ¿Qué ocurre si un bibliotecario es degradado mientras su token sigue vigente?

- **Efecto inmediato:** aunque el *access token* todavía no haya vencido, en la **siguiente petición** `JwtAuth.validate()` leerá el rol actualizado (`'socio'`) y `RolesInterceptor` rechazará cualquier ruta exclusiva de bibliotecario con `403 Forbidden`.
- **Contrapartida (trade-off):** se realiza una lectura del socio en cada petición autenticada (en lugar de confiar de forma puramente *stateless* en los claims del JWT). Se prioriza la revocación inmediata de privilegios por sobre ahorrar esa consulta.

### 5. Ciclo de refresco y cierre de sesión (`src/auth/auth.controller.ts`)

- **`POST /auth/refresh` (`@Public()`):** recibe `{ refreshToken }` y llama a `TokenService.refresh()`. Rota el token emitiendo un nuevo par `{ accessToken, refreshToken }` e invalidando el anterior. Si alguien reutiliza un *refresh token* ya consumido, `@nestjs/authentication` revoca toda la familia de tokens de esa sesión y responde `401 Unauthorized`.
- **`POST /auth/logout` (autenticado):** recibe `{ refreshToken }` y llama a `TokenService.revoke()` (`204 No Content`) para cerrar únicamente la sesión de ese dispositivo.
- **`POST /auth/logout-todos` (autenticado):** llama a `TokenService.revokeAll(String(usuario.id))` (`204 No Content`) para invalidar todas las sesiones activas del usuario en todos sus dispositivos.

---

## Pruebas incluidas

- **Unitarias (`npm test`):**
  - `src/auth/roles.interceptor.spec.ts`: valida `RolesInterceptor` sin roles, con rol autorizado, con rol insuficiente (`403`) y sin usuario (`403`).
  - `src/libros/libros.service.spec.ts`: suite base de `LibrosService`.
- **E2E (`npm run test:e2e`):**
  - `test/libros.e2e-spec.ts`: alta y consulta de libros autenticándose como bibliotecario.
  - `test/auth-seguridad.e2e-spec.ts`: cobertura completa de las 5 consignas (hasheo y ocultamiento de contraseñas, login y payload JWT, expiración por `JWT_TTL`, protección global de rutas existentes y rutas nuevas, rutas públicas, roles de bibliotecario vs. socio, rechazo de `socioId` en body, `404` anti-enumeración en préstamos ajenos, degradación inmediata de rol, rotación y robo de *refresh tokens*, `logout` y `logout-todos`).
