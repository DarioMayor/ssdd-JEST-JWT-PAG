# Sistemas Distribuidos — Clase 8 (`JEST`, `JWT`, `PAG`)

Repositorio con los tres capítulos prácticos de la API REST de una **biblioteca universitaria** en NestJS (`libros`, `socios` y `préstamos`).

## Estructura del repositorio

| Capítulo | Carpeta | Enfoque principal |
| --- | --- | --- |
| Capítulo 1 — Testing | [`clase8/cap1-jest`](./clase8/cap1-jest/README.md) | Pruebas unitarias con mocks de Jest y pruebas e2e con Supertest sobre reglas de negocio en memoria (`prestamos.service.spec.ts`, `prestamos.e2e-spec.ts`). |
| Capítulo 2 — Seguridad | [`clase8/cap2-jwt`](./clase8/cap2-jwt/README.md) | Hashing de contraseñas (`scrypt`), autenticación JWT (`accessToken` + rotación de `refreshToken`), protección global por defecto, control de roles (`socio` vs `bibliotecario`) y aislamiento de préstamos. |
| Capítulo 3 — Escalabilidad de consultas | [`clase8/cap3-paginacion`](./clase8/cap3-paginacion/README.md) | Entorno Docker con TypeORM + MariaDB (100.000 libros, 5.000 socios, 42.000 préstamos), paginación por offset generalizada, ordenamiento determinístico con filtros combinables y paginación por cursor (*keyset*) consistente ante inserciones concurrentes. |

---

## Resumen de lo implementado

### Capítulo 1 — Jest (Unit & E2E)
- Suite unitaria de `PrestamosService` verificando cálculo de multas, vencimientos, topes de préstamos activos y manejo de errores.
- Suite e2e completa validando creación de préstamos, devoluciones con/sin multa y consultas sobre la aplicación NestJS.

### Capítulo 2 — JWT y Autorización
- Registro y login con contraseñas hasheadas (`PasswordHasher`) omitiendo `contrasenaHash` de todas las respuestas.
- Guard global de autenticación JWT (`JwtAuth`) con rutas `@Public()` acotadas (`GET /salud`, `POST /socios`, `POST /auth/login`, `POST /auth/refresh`).
- Control de roles con `@Roles()` + `RolesInterceptor` resolviendo el rol actualizado desde la base en cada request, privacidad de préstamos por socio (`404` anti-enumeración) y revocación/rotación de *refresh tokens* (`refresh`, `logout`, `logout-todos`).

### Capítulo 3 — Paginación, orden y filtros
- Mecanismo reutilizable en `src/paginacion/` (`PaginacionDto`, `CursorDto`, `paginar()`, `paginarPorCursor()`) con sobre `{ datos, meta }` y validación estricta (`pagina=1`, `limite=20`, máximo `100`).
- Filtros combinables (`categoria`, `anioDesde`, `anioHasta`, `buscar` en `titulo`/`autor`) y ordenamiento por lista blanca con desempate determinístico por `id ASC` en `GET /libros`.
- Recorrido por cursor opaco Base64URL en `GET /libros/cursor` ordenado por `(titulo ASC, id ASC)`, estable ante títulos repetidos e inserciones concurrentes.
- Generalización del paginador en `GET /socios` y `GET /prestamos` (con filtros por `socioId` y `estado`: `activo`, `devuelto`, `vencido`), junto a tests unitarios (`src/paginacion/paginar.spec.ts`) y e2e (`test/paginacion.e2e-spec.ts`).
