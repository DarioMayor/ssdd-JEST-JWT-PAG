# Biblioteca — Capítulo 3: Paginación, orden y filtros

API REST de una biblioteca universitaria (libros, socios y préstamos) sobre **NestJS + TypeORM + MariaDB**, con paginación por offset, ordenamiento determinístico, filtros combinables y recorrido consistente por cursor (*keyset pagination*).
Todo el entorno corre en Docker: la aplicación, la base de datos y un cliente web de la base.

## Requisitos

- Docker con Docker Compose (Docker Desktop en Windows y macOS).
- Un cliente REST (extensión REST Client de VS Code, Thunder Client o similar).

No hace falta instalar Node.js ni MariaDB.

## Levantar el entorno

```bash
docker compose up --build
```

La primera vez demora unos minutos: descarga las imágenes, instala las dependencias y crea la base con sus datos.
Cuando en la consola aparezca `Nest application successfully started`, la API está en http://localhost:3000.

| Servicio | Dirección | Para qué |
|---|---|---|
| `api` | http://localhost:3000 | La aplicación NestJS (se recarga al guardar cambios) |
| `db` | `localhost:3306` | MariaDB. Usuario `biblioteca`, contraseña `biblioteca` (root: `root`) |
| `adminer` | http://localhost:8080 | Cliente web: sistema *MySQL*, servidor `db`, usuario `biblioteca`, contraseña `biblioteca` |

Comprobación rápida: `GET http://localhost:3000/salud` debe responder `{"estado":"ok", ...}`.

## Datos de prueba

La base `biblioteca` se crea con estos registros (siempre los mismos, son pseudoaleatorios pero deterministas):

| Tabla | Registros | Observaciones |
|---|---|---|
| `libros` | 100.000 | Unos 9.000 títulos distintos: los títulos **se repiten** (en promedio, 11 libros por título) |
| `socios` | 5.000 | |
| `prestamos` | 42.000 | 40.000 devueltos (algunos con multa) y 2.000 activos, de los cuales unos 1.000 están vencidos |

Las tablas tienen solo clave primaria. Su estructura está en `db/init/01-schema.sql` y los datos en `db/init/02-seed.sql`.

## Probar la API

Con el entorno levantado, pruebe los endpoints con su cliente REST o `curl`. Por ejemplo:

```http
GET http://localhost:3000/libros?pagina=1&limite=20
GET http://localhost:3000/libros?categoria=Cuento&anioDesde=1940&anioHasta=2000&buscar=borges&ordenarPor=anio&direccion=desc
GET http://localhost:3000/libros/cursor?limite=20
GET http://localhost:3000/socios?pagina=1&limite=20
GET http://localhost:3000/prestamos?estado=vencido&pagina=1&limite=20
```

## Ejecutar los tests

Los tests corren dentro del contenedor de la API, con la base en funcionamiento:

```bash
docker compose exec api npm test          # unitarios
docker compose exec api npm run test:e2e  # e2e
```

Los tests e2e usan la base **`biblioteca_test`**, que existe vacía y con la misma estructura, de modo que nunca modifican los datos de prueba.
Si el entorno no está levantado, use `docker compose run --rm api npm run test:e2e` (levanta la base y ejecuta los tests).

## Operaciones útiles

```bash
docker compose logs -f api      # ver el registro de la aplicación
docker compose restart api      # reiniciar la API (si no detecta cambios de archivos en Windows)
docker compose exec db mariadb -ubiblioteca -pbiblioteca biblioteca   # consola SQL
docker compose down             # detener el entorno (se conservan los datos)
docker compose down -v          # detener y BORRAR los datos: la próxima vez se regeneran desde cero
```

Si modifica `db/init/*.sql`, los cambios solo se aplican al recrear la base con `docker compose down -v`.
Si agrega dependencias a `package.json`, reconstruya con `docker compose up --build`.


---

## Qué se implementó (por consigna)

### 1. Paginación por offset en `GET /libros` (`src/paginacion/`, `src/libros/`)

- **Parámetros y límites (`PaginacionDto` en `src/paginacion/paginacion.dto.ts`):**
  - `pagina`: entero `>= 1` (por defecto `1`).
  - `limite`: entero entre `1` y `100` (`LIMITE_POR_DEFECTO = 20`, `LIMITE_MAXIMO = 100`).
- **Validación estricta (`normalizarNumeroQuery` + `ValidationPipe` global):** rechaza con `400 Bad Request` valores no numéricos (`pagina=abc`), decimales (`pagina=1.5`), valores menores a `1`, strings vacíos, arrays o límites mayores a `100`, así como parámetros desconocidos (`forbidNonWhitelisted: true`).
- **Metadatos elegidos y justificación (`{ datos, meta }` vs cabeceras HTTP):**
  - Todas las listas paginadas por offset responden con `{ datos, meta: { total, pagina, limite, totalPaginas } }` en el cuerpo JSON.
  - Se eligió el formato en el cuerpo en lugar de cabeceras HTTP (`X-Total-Count`, `Link`) porque un frontend (SPA), cliente móvil o test obtiene la página y el estado completo de navegación en una sola lectura tipada, sin necesitar configuración adicional de CORS (`Access-Control-Expose-Headers`) ni parsear cabeceras manualmente.

### 2. Ordenamiento determinístico y filtros combinables (`ConsultaLibrosDto`, `LibrosService`)

- **Ordenamiento restringido por lista blanca:** `ordenarPor` acepta únicamente `id`, `titulo`, `autor`, `anio`, `categoria` o `disponibles` (por defecto `id`), y `direccion` acepta `asc` o `desc` (por defecto `asc`, normalizando mayúsculas/minúsculas).
- **Filtros combinables en `GET /libros`:**
  - `categoria`: coincidencia exacta de categoría.
  - `anioDesde` / `anioHasta`: rango inclusivo sobre `anio` (`>=` y `<=`).
  - `buscar`: búsqueda de texto insensible a mayúsculas sobre `titulo` o `autor` (`LOWER(...) LIKE LOWER(...) ESCAPE '!'`, escapando comodines SQL con `escaparLike()`).
- **Determinismo con valores repetidos:** en `paginar()`, cuando `ordenarPor` no es `id`, siempre se agrega `.addOrderBy('<alias>.id', 'ASC')` como desempate determinístico para que los registros empatados nunca cambien de orden entre páginas.

### 3. Paginación por cursor en `GET /libros/cursor` (`LibrosController`, `paginarPorCursor()`)

- **Orden de rutas:** `@Get('cursor')` se declara antes de `@Get(':id')` en `LibrosController` para evitar que NestJS intente parsear `"cursor"` como un `id` numérico.
- **Cursor opaco (`CursorDto`):** recibe `limite` (1–100, por defecto `20`) y `despues` (token Base64URL opaco que codifica `{ t: titulo, id }`). Cualquier cursor corrupto, malformado o con estructura inválida responde `400 Bad Request`.
- **Consistencia ante títulos repetidos e inserciones concurrentes:**
  - Consulta ordenada por `(libro.titulo ASC, libro.id ASC)` usando condición *keyset* directa en MariaDB: `(libro.titulo > :cursorValor OR (libro.titulo = :cursorValor AND libro.id > :cursorId))`, preservando la colación `utf8mb4_unicode_ci`.
  - Al anclar el corte a valores `(titulo, id)` en lugar de desplazamientos numéricos (`OFFSET`), insertar libros concurrentemente no desplaza la ventana ni genera duplicados ni omisiones entre los libros existentes al comenzar.
- **Omisión del total y justificación:**
  - El endpoint responde `{ datos, siguiente }` (con `siguiente: string | null`) solicitando `limite + 1` filas para saber si existe página siguiente, y **no** devuelve `total`.
  - En catálogos grandes (100.000+ filas) o bajo escrituras concurrentes, calcular `COUNT(*)` en cada página exige recorrer la tabla/índice en cada request (perdiendo la eficiencia de costo constante del *keyset*) y produce un contador que queda desactualizado inmediatamente si otro cliente inserta libros durante el recorrido.

### 4. Mecanismo generalizado en `GET /socios` y `GET /prestamos` (`src/paginacion/paginar.ts`)

- Se extrajo `PaginacionDto`, `CursorDto` y los helpers genéricos `paginar()` / `paginarPorCursor()` en `src/paginacion/` para no duplicar lógica entre módulos.
- **`GET /socios`:** aplica `PaginacionDto` y `paginar()` ordenando determinísticamente por `socio.id ASC`.
- **`GET /prestamos` (`ConsultaPrestamosDto`):** combina `PaginacionDto` con filtros opcionales por `socioId` y `estado`:
  - `activo`: préstamos sin devolver (`devueltoEn IS NULL`).
  - `devuelto`: préstamos devueltos (`devueltoEn IS NOT NULL`).
  - `vencido`: préstamos sin devolver cuya fecha de vencimiento ya pasó (`devueltoEn IS NULL AND vencimiento < ahora`).

### 5. Pruebas incluidas (`npm test` y `npm run test:e2e`)

- **Unitarias (`src/paginacion/paginar.spec.ts` y `src/libros/libros.service.spec.ts`):**
  - Normalización de query params, defaults y rechazos en `PaginacionDto`, `CursorDto`, `ConsultaLibrosDto` y `ConsultaPrestamosDto`.
  - Cálculo de `skip`, `take` y `totalPaginas`, desempate por `id ASC` en `paginar()`, codificación/validación de cursores opacos, lookahead `limite + 1` en `paginarPorCursor()` y escape en `escaparLike()`.
- **E2E contra `biblioteca_test` (`test/paginacion.e2e-spec.ts` y `test/libros.e2e-spec.ts`):**
  - Casos de borde en `GET /libros` (defaults, primera/última página, página fuera de rango, límite máximo `100`, límite `101 -> 400`, parámetros inválidos/vacíos/no permitidos).
  - Combinación de `categoria`, rango de años, `buscar` en título/autor, ordenamiento `asc`/`desc`, rechazo de campos/direcciones inválidas y determinismo con títulos repetidos.
  - Recorrido completo de `GET /libros/cursor` con títulos repetidos e inserciones concurrentes (`POST /libros` con título anterior, idéntico y posterior) comprobando **0 duplicados** y **0 omisiones** entre los libros iniciales.
  - Paginación en `GET /socios` y paginación + filtros (`socioId`, `activo`, `devuelto`, `vencido`) en `GET /prestamos`.
