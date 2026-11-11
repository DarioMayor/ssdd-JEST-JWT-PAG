import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/app.setup';

describe('Libros (e2e)', () => {
  let app: INestApplication<App>;
  let tokenBibliotecario: string;

  beforeEach(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();

    // Registramos un bibliotecario e iniciamos sesión para poder crear libros
    await request(app.getHttpServer())
      .post('/socios')
      .send({
        nombre: 'Admin Biblioteca',
        email: 'biblio@uni.edu',
        contrasena: 'secreto123',
        rol: 'bibliotecario',
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'biblio@uni.edu', contrasena: 'secreto123' })
      .expect(200);

    tokenBibliotecario = login.body.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /libros crea un libro y GET /libros/:id lo devuelve', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/libros')
      .set('Authorization', `Bearer ${tokenBibliotecario}`)
      .send({
        titulo: 'Rayuela',
        autor: 'Julio Cortázar',
        isbn: '9788437604572',
        categoria: 'novela',
        anio: 1963,
        ejemplares: 2,
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/libros/${body.id}`)
      .set('Authorization', `Bearer ${tokenBibliotecario}`)
      .expect(200);
  });

  it('rechaza un libro inválido con 400', () => {
    return request(app.getHttpServer())
      .post('/libros')
      .set('Authorization', `Bearer ${tokenBibliotecario}`)
      .send({ titulo: 'X' })
      .expect(400);
  });
});
