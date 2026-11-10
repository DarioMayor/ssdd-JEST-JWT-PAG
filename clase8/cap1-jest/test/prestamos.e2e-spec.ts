import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/app.setup';

describe('Prestamos (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('flujo completo: registrar libro -> registrar socio -> prestar -> devolver', async () => {
    const server = app.getHttpServer();

    // 1. Registrar libro (con 2 ejemplares)
    const resLibro = await request(server)
      .post('/libros')
      .send({
        titulo: 'El Aleph',
        autor: 'Jorge Luis Borges',
        isbn: '9789500428798',
        categoria: 'ficcion',
        anio: 1949,
        ejemplares: 2,
      })
      .expect(201);

    const libroId = resLibro.body.id;
    expect(resLibro.body.disponibles).toBe(2);

    // 2. Registrar socio
    const resSocio = await request(server)
      .post('/socios')
      .send({
        nombre: 'Martín Fierro',
        email: 'martin@ejemplo.com',
      })
      .expect(201);

    const socioId = resSocio.body.id;

    // 3. Prestar libro
    const resPrestamo = await request(server)
      .post('/prestamos')
      .send({
        libroId,
        socioId,
        dias: 7,
      })
      .expect(201);

    const prestamoId = resPrestamo.body.id;
    expect(resPrestamo.body.devueltoEn).toBeNull();

    // Verificamos que el libro ahora tenga 1 disponible
    const resLibroDescontado = await request(server)
      .get(`/libros/${libroId}`)
      .expect(200);
    expect(resLibroDescontado.body.disponibles).toBe(1);

    // 4. Devolver libro
    const resDevolucion = await request(server)
      .post(`/prestamos/${prestamoId}/devolucion`)
      .expect(200);

    expect(resDevolucion.body.devueltoEn).not.toBeNull();
    expect(resDevolucion.body.multa).toBe(0);

    // Verificamos que el libro volvió a tener sus 2 disponibles
    const resLibroRepuesto = await request(server)
      .get(`/libros/${libroId}`)
      .expect(200);
    expect(resLibroRepuesto.body.disponibles).toBe(2);
  });

    it('rechaza con 400 datos inválidos al prestar (días mayores a 30 o negativos)', async () => {
    const server = app.getHttpServer();

    // Días = 0 (mínimo es 1)
    await request(server)
      .post('/prestamos')
      .send({ libroId: 1, socioId: 1, dias: 0 })
      .expect(400);

    // Días = 31 (máximo es 30)
    await request(server)
      .post('/prestamos')
      .send({ libroId: 1, socioId: 1, dias: 31 })
      .expect(400);
  });

  it('responde 404 si el libro o el socio no existen al intentar prestar', async () => {
    const server = app.getHttpServer();

    // 1. Creamos un socio real
    const resSocio = await request(server)
      .post('/socios')
      .send({ nombre: 'Juan', email: 'juan@test.com' })
      .expect(201);

    // Libro inexistente (9999) -> 404
    await request(server)
      .post('/prestamos')
      .send({ libroId: 9999, socioId: resSocio.body.id })
      .expect(404);

    // 2. Creamos un libro real
    const resLibro = await request(server)
      .post('/libros')
      .send({
        titulo: 'Ficciones',
        autor: 'Borges',
        isbn: '1234567890',
        categoria: 'ficcion',
        anio: 1944,
        ejemplares: 1,
      })
      .expect(201);

    // Socio inexistente (9999) -> 404
    await request(server)
      .post('/prestamos')
      .send({ libroId: resLibro.body.id, socioId: 9999 })
      .expect(404);
  });

  it('responde 409 si se intenta devolver un préstamo ya devuelto', async () => {
    const server = app.getHttpServer();

    // Preparamos libro, socio y préstamo
    const { body: libro } = await request(server)
      .post('/libros')
      .send({
        titulo: 'Libro X',
        autor: 'Autor Y',
        isbn: '1234567890123',
        categoria: 'ensayo',
        anio: 2000,
        ejemplares: 1,
      });

    const { body: socio } = await request(server)
      .post('/socios')
      .send({ nombre: 'Ana', email: 'ana@test.com' });

    const { body: prestamo } = await request(server)
      .post('/prestamos')
      .send({ libroId: libro.id, socioId: socio.id });

    // Primera devolución: OK (200)
    await request(server)
      .post(`/prestamos/${prestamo.id}/devolucion`)
      .expect(200);

    // Segunda devolución: Error (409)
    await request(server)
      .post(`/prestamos/${prestamo.id}/devolucion`)
      .expect(409);
  });

  
});