import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/app.setup';
import { Libro } from '../src/libros/entities/libro.entity';
import { Prestamo } from '../src/prestamos/entities/prestamo.entity';
import { Socio } from '../src/socios/entities/socio.entity';

describe('Paginación, orden y filtros (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let seqIsbn = 1;

  function siguienteIsbn(): string {
    const num = String(seqIsbn++).padStart(7, '0');
    return `978-0-${num}`;
  }

  async function limpiarTablas() {
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
    await dataSource.query('TRUNCATE TABLE prestamos');
    await dataSource.query('TRUNCATE TABLE socios');
    await dataSource.query('TRUNCATE TABLE libros');
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  async function sembrarLibros(
    cantidad: number,
    overrides?: (indice: number) => Partial<Libro>,
  ): Promise<Libro[]> {
    const repo = dataSource.getRepository(Libro);
    const entidades: Libro[] = [];
    for (let i = 1; i <= cantidad; i++) {
      const extra = overrides?.(i) ?? {};
      entidades.push(
        repo.create({
          titulo: extra.titulo ?? `Libro ${String(i).padStart(3, '0')}`,
          autor: extra.autor ?? `Autor ${i}`,
          isbn: extra.isbn ?? siguienteIsbn(),
          categoria: extra.categoria ?? 'Ficción',
          anio: extra.anio ?? 2000 + (i % 20),
          ejemplares: extra.ejemplares ?? 5,
          disponibles: extra.disponibles ?? extra.ejemplares ?? 5,
        }),
      );
    }
    return repo.save(entidades);
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
    dataSource = modulo.get(DataSource);
  });

  beforeEach(async () => {
    await limpiarTablas();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /libros - Paginación por offset y validación', () => {
    it('aplica parámetros por defecto (pagina=1, limite=20) y devuelve primera y última página exactas', async () => {
      await sembrarLibros(25);

      const resDefault = await request(app.getHttpServer())
        .get('/libros')
        .expect(200);

      expect(resDefault.body.meta).toEqual({
        total: 25,
        pagina: 1,
        limite: 20,
        totalPaginas: 2,
      });
      expect(resDefault.body.datos).toHaveLength(20);

      const p1 = await request(app.getHttpServer())
        .get('/libros')
        .query({ pagina: 1, limite: 10 })
        .expect(200);
      const p2 = await request(app.getHttpServer())
        .get('/libros')
        .query({ pagina: 2, limite: 10 })
        .expect(200);
      const p3 = await request(app.getHttpServer())
        .get('/libros')
        .query({ pagina: 3, limite: 10 })
        .expect(200);

      expect(p1.body.datos).toHaveLength(10);
      expect(p2.body.datos).toHaveLength(10);
      expect(p3.body.datos).toHaveLength(5);
      expect(p3.body.meta).toEqual({
        total: 25,
        pagina: 3,
        limite: 10,
        totalPaginas: 3,
      });

      const ids = [
        ...p1.body.datos.map((l: Libro) => l.id),
        ...p2.body.datos.map((l: Libro) => l.id),
        ...p3.body.datos.map((l: Libro) => l.id),
      ];
      expect(new Set(ids).size).toBe(25);
    });

    it('devuelve lista vacía con metadatos consistentes si la página está fuera de rango', async () => {
      await sembrarLibros(5);

      const res = await request(app.getHttpServer())
        .get('/libros')
        .query({ pagina: 99, limite: 10 })
        .expect(200);

      expect(res.body).toEqual({
        datos: [],
        meta: {
          total: 5,
          pagina: 99,
          limite: 10,
          totalPaginas: 1,
        },
      });
    });

    it('acepta el límite máximo (100) y rechaza valores por encima del máximo', async () => {
      await sembrarLibros(105);

      const resMax = await request(app.getHttpServer())
        .get('/libros')
        .query({ pagina: 1, limite: 100 })
        .expect(200);

      expect(resMax.body.datos).toHaveLength(100);
      expect(resMax.body.meta.totalPaginas).toBe(2);

      await request(app.getHttpServer())
        .get('/libros')
        .query({ limite: 101 })
        .expect(400);
    });

    it('rechaza parámetros no numéricos, menores a 1, vacíos o no permitidos', async () => {
      const queriesInvalidas = [
        'pagina=abc',
        'limite=xyz',
        'pagina=1.5',
        'limite=2.5',
        'pagina=0',
        'limite=0',
        'pagina=-3',
        'pagina=',
        'parametroDesconocido=1',
      ];

      for (const query of queriesInvalidas) {
        await request(app.getHttpServer()).get(`/libros?${query}`).expect(400);
      }
    });
  });

  describe('GET /libros - Filtros combinables y ordenamiento determinístico', () => {
    it('combina filtros de categoria, rango de años y búsqueda en título o autor con ordenamiento', async () => {
      await sembrarLibros(5, (i) => {
        const datos: Partial<Libro>[] = [
          { titulo: 'Ficciones', autor: 'Jorge Luis Borges', categoria: 'Cuento', anio: 1944, disponibles: 3 },
          { titulo: 'El Aleph', autor: 'Jorge Luis Borges', categoria: 'Cuento', anio: 1949, disponibles: 7 },
          { titulo: 'Borges en diálogo', autor: 'Osvaldo Ferrari', categoria: 'Ensayo', anio: 1985, disponibles: 2 },
          { titulo: 'Cuentos de la selva', autor: 'Horacio Quiroga', categoria: 'Cuento', anio: 1918, disponibles: 4 },
          { titulo: 'El libro de arena', autor: 'Jorge Luis Borges', categoria: 'Cuento', anio: 1975, disponibles: 1 },
        ];
        return datos[i - 1];
      });

      const res = await request(app.getHttpServer())
        .get('/libros')
        .query({
          categoria: 'Cuento',
          anioDesde: 1940,
          anioHasta: 1960,
          buscar: 'borges',
          ordenarPor: 'anio',
          direccion: 'DESC',
        })
        .expect(200);

      expect(res.body.meta.total).toBe(2);
      expect(res.body.datos.map((l: Libro) => l.titulo)).toEqual([
        'El Aleph',
        'Ficciones',
      ]);

      // Búsqueda también encuentra por coincidencia en título aunque no esté en autor
      const resTitulo = await request(app.getHttpServer())
        .get('/libros')
        .query({ buscar: 'diálogo' })
        .expect(200);
      expect(resTitulo.body.meta.total).toBe(1);
      expect(resTitulo.body.datos[0].autor).toBe('Osvaldo Ferrari');
    });

    it('rechaza campos de ordenamiento o dirección inválidos', async () => {
      await request(app.getHttpServer())
        .get('/libros')
        .query({ ordenarPor: 'campoInvalido' })
        .expect(400);

      await request(app.getHttpServer())
        .get('/libros')
        .query({ direccion: 'diagonal' })
        .expect(400);
    });

    it('mantiene orden determinístico entre páginas cuando el campo de ordenamiento tiene valores repetidos', async () => {
      const creados = await sembrarLibros(6, () => ({
        titulo: 'Mismo Título',
      }));
      const idsEsperados = creados.map((l) => l.id).sort((a, b) => a - b);

      const idsRecorridos: number[] = [];
      for (let pagina = 1; pagina <= 3; pagina++) {
        const res = await request(app.getHttpServer())
          .get('/libros')
          .query({ ordenarPor: 'titulo', direccion: 'asc', pagina, limite: 2 })
          .expect(200);
        idsRecorridos.push(...res.body.datos.map((l: Libro) => l.id));
      }

      expect(idsRecorridos).toEqual(idsEsperados);
    });
  });

  describe('GET /libros/cursor - Recorrido por cursor consistente', () => {
    it('rechaza un cursor malformado o vacío con 400', async () => {
      await request(app.getHttpServer())
        .get('/libros/cursor')
        .query({ despues: 'cursor-trucho!!!' })
        .expect(400);

      await request(app.getHttpServer())
        .get('/libros/cursor')
        .query({ despues: '' })
        .expect(400);
    });

    it('recorre el catálogo completo con títulos repetidos e inserciones concurrentes sin duplicados ni omisiones', async () => {
      const titulosBase = ['Alfa', 'Beta', 'Beta', 'Gamma', 'Delta', 'Mismo', 'Zulu'];
      const iniciales = await sembrarLibros(120, (i) => ({
        titulo: `${titulosBase[i % titulosBase.length]} - grupo ${(i % 5) + 1}`,
      }));
      const idsIniciales = iniciales.map((l) => l.id);

      const vistos: number[] = [];
      const idsInsertadosAntesDelCursor: number[] = [];
      let cursor: string | null = null;
      let iteracion = 0;

      do {
        const query: Record<string, string | number> = { limite: 15 };
        if (cursor) {
          query.despues = cursor;
        }

        // En la primera página, otro cliente inserta concurrentemente libros con:
        // - título estrictamente anterior al primer grupo ('000 Anterior')
        // - título idéntico a un existente ('Beta - grupo 1')
        // - título estrictamente posterior ('ZZZ Posterior')
        let respuestaCursor;
        if (iteracion === 1) {
          const [resCur, resAntes, resIgual, resDespues] = await Promise.all([
            request(app.getHttpServer()).get('/libros/cursor').query(query),
            request(app.getHttpServer()).post('/libros').send({
              titulo: '000 Anterior concurrente',
              autor: 'Autor Concurrente',
              isbn: siguienteIsbn(),
              categoria: 'Ensayo',
              anio: 2024,
              ejemplares: 2,
            }),
            request(app.getHttpServer()).post('/libros').send({
              titulo: 'Beta - grupo 1',
              autor: 'Autor Concurrente',
              isbn: siguienteIsbn(),
              categoria: 'Ensayo',
              anio: 2024,
              ejemplares: 2,
            }),
            request(app.getHttpServer()).post('/libros').send({
              titulo: 'ZZZ Posterior concurrente',
              autor: 'Autor Concurrente',
              isbn: siguienteIsbn(),
              categoria: 'Ensayo',
              anio: 2024,
              ejemplares: 2,
            }),
          ]);

          expect(resCur.status).toBe(200);
          expect(resAntes.status).toBe(201);
          expect(resIgual.status).toBe(201);
          expect(resDespues.status).toBe(201);
          idsInsertadosAntesDelCursor.push(resAntes.body.id);
          respuestaCursor = resCur;
        } else {
          respuestaCursor = await request(app.getHttpServer())
            .get('/libros/cursor')
            .query(query)
            .expect(200);
        }

        const datos = respuestaCursor.body.datos as Libro[];
        vistos.push(...datos.map((l) => l.id));
        cursor = respuestaCursor.body.siguiente;
        iteracion++;
      } while (cursor);

      // Cero duplicados en todo el recorrido
      expect(new Set(vistos).size).toBe(vistos.length);

      // Cero omisiones entre los 120 libros que existían al comenzar
      const setVistos = new Set(vistos);
      for (const idInicial of idsIniciales) {
        expect(setVistos.has(idInicial)).toBe(true);
      }

      // Los nuevos anteriores al punto actual no desplazaron ni generaron relecturas
      for (const idAntes of idsInsertadosAntesDelCursor) {
        expect(setVistos.has(idAntes)).toBe(false);
      }
    });
  });

  describe('GET /socios y GET /prestamos - Mecanismo generalizado y filtros', () => {
    it('pagina GET /socios reutilizando el mismo contrato { datos, meta }', async () => {
      const repoSocios = dataSource.getRepository(Socio);
      await repoSocios.save(
        Array.from({ length: 7 }, (_, i) =>
          repoSocios.create({
            nombre: `Socio ${i + 1}`,
            email: `socio${i + 1}@test.com`,
          }),
        ),
      );

      const res = await request(app.getHttpServer())
        .get('/socios')
        .query({ pagina: 2, limite: 3 })
        .expect(200);

      expect(res.body.meta).toEqual({
        total: 7,
        pagina: 2,
        limite: 3,
        totalPaginas: 3,
      });
      expect(res.body.datos).toHaveLength(3);
    });

    it('pagina GET /prestamos y filtra por socioId y estado (activo, devuelto, vencido)', async () => {
      const [libro] = await sembrarLibros(1, () => ({ ejemplares: 10 }));
      const repoSocios = dataSource.getRepository(Socio);
      const [socio1, socio2] = await repoSocios.save([
        repoSocios.create({ nombre: 'Ana', email: 'ana@test.com' }),
        repoSocios.create({ nombre: 'Luis', email: 'luis@test.com' }),
      ]);

      const repoPrestamos = dataSource.getRepository(Prestamo);
      const ahora = Date.now();
      const dia = 24 * 60 * 60 * 1000;

      await repoPrestamos.save([
        // socio1: 1 activo vigente, 1 vencido, 1 devuelto
        repoPrestamos.create({
          libroId: libro.id,
          socioId: socio1.id,
          prestadoEn: new Date(ahora - 2 * dia),
          vencimiento: new Date(ahora + 10 * dia),
          devueltoEn: null,
          multa: 0,
        }),
        repoPrestamos.create({
          libroId: libro.id,
          socioId: socio1.id,
          prestadoEn: new Date(ahora - 20 * dia),
          vencimiento: new Date(ahora - 5 * dia),
          devueltoEn: null,
          multa: 0,
        }),
        repoPrestamos.create({
          libroId: libro.id,
          socioId: socio1.id,
          prestadoEn: new Date(ahora - 15 * dia),
          vencimiento: new Date(ahora - 1 * dia),
          devueltoEn: new Date(ahora - 2 * dia),
          multa: 0,
        }),
        // socio2: 1 devuelto
        repoPrestamos.create({
          libroId: libro.id,
          socioId: socio2.id,
          prestadoEn: new Date(ahora - 10 * dia),
          vencimiento: new Date(ahora + 2 * dia),
          devueltoEn: new Date(ahora - 1 * dia),
          multa: 0,
        }),
      ]);

      const activosSocio1 = await request(app.getHttpServer())
        .get('/prestamos')
        .query({ socioId: socio1.id, estado: 'activo' })
        .expect(200);
      expect(activosSocio1.body.meta.total).toBe(2);

      const vencidos = await request(app.getHttpServer())
        .get('/prestamos')
        .query({ estado: 'vencido' })
        .expect(200);
      expect(vencidos.body.meta.total).toBe(1);
      expect(vencidos.body.datos[0].socioId).toBe(socio1.id);

      const devueltos = await request(app.getHttpServer())
        .get('/prestamos')
        .query({ estado: 'devuelto', pagina: 1, limite: 1 })
        .expect(200);
      expect(devueltos.body.meta).toEqual({
        total: 2,
        pagina: 1,
        limite: 1,
        totalPaginas: 2,
      });

      await request(app.getHttpServer())
        .get('/prestamos')
        .query({ estado: 'invalido' })
        .expect(400);
    });
  });
});
