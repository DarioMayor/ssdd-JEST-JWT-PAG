import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/app.setup';
import { SociosService } from '../src/socios/socios.service';

@Controller('ruta-nueva-prueba')
class RutaNuevaPruebaController {
  @Get()
  recurso() {
    return { ok: true };
  }
}

async function crearYLoguear(
  app: INestApplication<App>,
  datos: {
    nombre: string;
    email: string;
    contrasena: string;
    rol?: 'socio' | 'bibliotecario';
  },
) {
  const socioRes = await request(app.getHttpServer())
    .post('/socios')
    .send(datos)
    .expect(201);

  const loginRes = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: datos.email, contrasena: datos.contrasena })
    .expect(200);

  return {
    socio: socioRes.body,
    accessToken: loginRes.body.accessToken as string,
    refreshToken: loginRes.body.refreshToken as string,
  };
}

describe('Seguridad y JWT (e2e)', () => {
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

  describe('Consigna 1: Contraseñas, Login y Payload JWT', () => {
    it('hashea la contraseña y nunca la expone en las respuestas', async () => {
      const server = app.getHttpServer();
      const { socio, accessToken } = await crearYLoguear(app, {
        nombre: 'Ana',
        email: 'ana@uni.edu',
        contrasena: 'claveSuperSecreta',
      });

      expect(socio.contrasena).toBeUndefined();
      expect(socio.contrasenaHash).toBeUndefined();

      const listado = await request(server)
        .get('/socios')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(listado.body[0].contrasena).toBeUndefined();
      expect(listado.body[0].contrasenaHash).toBeUndefined();

      const detalle = await request(server)
        .get(`/socios/${socio.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(detalle.body.contrasena).toBeUndefined();
      expect(detalle.body.contrasenaHash).toBeUndefined();

      // En el repositorio interno, el valor guardado es un hash (no texto claro)
      const conHash = app
        .get(SociosService)
        .findByEmailConHash('ana@uni.edu');
      expect(conHash?.contrasenaHash).toBeDefined();
      expect(conHash?.contrasenaHash).not.toBe('claveSuperSecreta');
    });

    it('rechaza login con contraseña incorrecta o email inexistente con 401', async () => {
      const server = app.getHttpServer();
      await request(server)
        .post('/socios')
        .send({ nombre: 'Ana', email: 'ana@uni.edu', contrasena: 'correcta123' })
        .expect(201);

      await request(server)
        .post('/auth/login')
        .send({ email: 'ana@uni.edu', contrasena: 'incorrecta' })
        .expect(401);

      await request(server)
        .post('/auth/login')
        .send({ email: 'noexiste@uni.edu', contrasena: 'correcta123' })
        .expect(401);
    });

    it('incluye id (sub), email, rol, emisor (iss) y expiración (exp) en el payload del JWT', async () => {
      const { socio, accessToken } = await crearYLoguear(app, {
        nombre: 'Carlos',
        email: 'carlos@uni.edu',
        contrasena: 'clave1234',
        rol: 'bibliotecario',
      });

      const partes = accessToken.split('.');
      expect(partes).toHaveLength(3);

      const payload = JSON.parse(
        Buffer.from(partes[1], 'base64url').toString('utf8'),
      );
      expect(payload.sub).toBe(String(socio.id));
      expect(payload.email).toBe('carlos@uni.edu');
      expect(payload.rol).toBe('bibliotecario');
      expect(payload.iss).toBe(process.env.JWT_ISSUER);
      expect(typeof payload.exp).toBe('number');
      expect(payload.contrasena).toBeUndefined();
      expect(payload.contrasenaHash).toBeUndefined();
    });
  });

  describe('Consigna 1 (expiración): JWT_TTL configurable por variable de entorno', () => {
    const ttlOriginal = process.env.JWT_TTL;

    afterEach(() => {
      process.env.JWT_TTL = ttlOriginal;
    });

    it('rechaza con 401 un token que expiró según JWT_TTL', async () => {
      process.env.JWT_TTL = '50ms';
      const modulo = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      const appCorta = modulo.createNestApplication();
      configurarApp(appCorta);
      await appCorta.init();

      try {
        const { accessToken } = await crearYLoguear(appCorta, {
          nombre: 'Efímero',
          email: 'efimero@uni.edu',
          contrasena: 'clave1234',
        });

        await new Promise((r) => setTimeout(r, 90));

        await request(appCorta.getHttpServer())
          .get('/libros')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(401);
      } finally {
        await appCorta.close();
      }
    });
  });

  describe('Consigna 2: Protección global por defecto y rutas públicas', () => {
    it('permite GET /salud, POST /socios y POST /auth/login sin token', async () => {
      const server = app.getHttpServer();
      await request(server).get('/salud').expect(200);

      await request(server)
        .post('/socios')
        .send({ nombre: 'Luz', email: 'luz@uni.edu', contrasena: 'clave123' })
        .expect(201);

      await request(server)
        .post('/auth/login')
        .send({ email: 'luz@uni.edu', contrasena: 'clave123' })
        .expect(200);
    });

    it('exige autenticación (401) en rutas existentes y con token inválido', async () => {
      const server = app.getHttpServer();

      await request(server).get('/libros').expect(401);
      await request(server).post('/libros').send({}).expect(401);
      await request(server).get('/socios').expect(401);
      await request(server).get('/prestamos').expect(401);
      await request(server).get('/prestamos/vencidos').expect(401);

      await request(server)
        .get('/libros')
        .set('Authorization', 'Bearer token.falso.invalido')
        .expect(401);
    });

    it('protege automáticamente una ruta nueva agregada sin decoradores', async () => {
      const modulo = await Test.createTestingModule({
        imports: [AppModule],
        controllers: [RutaNuevaPruebaController],
      }).compile();
      const appConRutaNueva = modulo.createNestApplication();
      configurarApp(appConRutaNueva);
      await appConRutaNueva.init();

      try {
        // Sin token -> 401 automáticamente
        await request(appConRutaNueva.getHttpServer())
          .get('/ruta-nueva-prueba')
          .expect(401);

        // Con token válido -> 200
        const { accessToken } = await crearYLoguear(appConRutaNueva, {
          nombre: 'Test',
          email: 'ruta@uni.edu',
          contrasena: 'clave1234',
        });
        await request(appConRutaNueva.getHttpServer())
          .get('/ruta-nueva-prueba')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
      } finally {
        await appConRutaNueva.close();
      }
    });
  });

  describe('Consignas 3 y 4: Roles, socio desde token y préstamos propios', () => {
    it('solo el bibliotecario puede crear, modificar y eliminar libros y ver vencidos', async () => {
      const server = app.getHttpServer();
      const { accessToken: tokenBiblio } = await crearYLoguear(app, {
        nombre: 'Biblio',
        email: 'biblio@uni.edu',
        contrasena: 'clave1234',
        rol: 'bibliotecario',
      });
      const { accessToken: tokenSocio } = await crearYLoguear(app, {
        nombre: 'Socio',
        email: 'socio@uni.edu',
        contrasena: 'clave1234',
        rol: 'socio',
      });

      const datosLibro = {
        titulo: 'Ficciones',
        autor: 'Jorge Luis Borges',
        isbn: '9789500428798',
        categoria: 'ficcion',
        anio: 1944,
        ejemplares: 3,
      };

      // Socio común recibe 403 en alta de libro y vencidos
      await request(server)
        .post('/libros')
        .set('Authorization', `Bearer ${tokenSocio}`)
        .send(datosLibro)
        .expect(403);

      await request(server)
        .get('/prestamos/vencidos')
        .set('Authorization', `Bearer ${tokenSocio}`)
        .expect(403);

      // Bibliotecario sí puede crear libro y ver vencidos
      const { body: libro } = await request(server)
        .post('/libros')
        .set('Authorization', `Bearer ${tokenBiblio}`)
        .send(datosLibro)
        .expect(201);

      await request(server)
        .get('/prestamos/vencidos')
        .set('Authorization', `Bearer ${tokenBiblio}`)
        .expect(200);

      // Socio común recibe 403 al intentar modificar o eliminar el libro
      await request(server)
        .patch(`/libros/${libro.id}`)
        .set('Authorization', `Bearer ${tokenSocio}`)
        .send({ titulo: 'Hack' })
        .expect(403);

      await request(server)
        .delete(`/libros/${libro.id}`)
        .set('Authorization', `Bearer ${tokenSocio}`)
        .expect(403);

      // Socio común sí puede consultar el catálogo
      await request(server)
        .get(`/libros/${libro.id}`)
        .set('Authorization', `Bearer ${tokenSocio}`)
        .expect(200);

      // Bibliotecario puede modificar y eliminar
      await request(server)
        .patch(`/libros/${libro.id}`)
        .set('Authorization', `Bearer ${tokenBiblio}`)
        .send({ titulo: 'Ficciones (Edición Revisada)' })
        .expect(200);

      await request(server)
        .delete(`/libros/${libro.id}`)
        .set('Authorization', `Bearer ${tokenBiblio}`)
        .expect(204);
    });

    it('toma el socio del token y oculta existencia de préstamos ajenos (404)', async () => {
      const server = app.getHttpServer();
      const { accessToken: tokenBiblio } = await crearYLoguear(app, {
        nombre: 'Biblio',
        email: 'biblio@uni.edu',
        contrasena: 'clave1234',
        rol: 'bibliotecario',
      });
      const socioA = await crearYLoguear(app, {
        nombre: 'Socio A',
        email: 'a@uni.edu',
        contrasena: 'clave1234',
      });
      const socioB = await crearYLoguear(app, {
        nombre: 'Socio B',
        email: 'b@uni.edu',
        contrasena: 'clave1234',
      });

      const { body: libro } = await request(server)
        .post('/libros')
        .set('Authorization', `Bearer ${tokenBiblio}`)
        .send({
          titulo: 'Rayuela',
          autor: 'Julio Cortázar',
          isbn: '9788437604572',
          categoria: 'novela',
          anio: 1963,
          ejemplares: 2,
        })
        .expect(201);

      // No acepta socioId en el cuerpo (forbidNonWhitelisted -> 400)
      await request(server)
        .post('/prestamos')
        .set('Authorization', `Bearer ${socioA.accessToken}`)
        .send({ libroId: libro.id, socioId: socioB.socio.id })
        .expect(400);

      // Socio A pide préstamo sin indicar socioId: se asigna al socio A
      const { body: prestamoA } = await request(server)
        .post('/prestamos')
        .set('Authorization', `Bearer ${socioA.accessToken}`)
        .send({ libroId: libro.id })
        .expect(201);
      expect(prestamoA.socioId).toBe(socioA.socio.id);

      // Socio B intenta consultar o devolver el préstamo de A -> mismo 404 que uno inexistente
      const respAjeno = await request(server)
        .get(`/prestamos/${prestamoA.id}`)
        .set('Authorization', `Bearer ${socioB.accessToken}`)
        .expect(404);
      const respInexistente = await request(server)
        .get('/prestamos/999999')
        .set('Authorization', `Bearer ${socioB.accessToken}`)
        .expect(404);
      expect(respAjeno.body.statusCode).toBe(respInexistente.body.statusCode);

      await request(server)
        .post(`/prestamos/${prestamoA.id}/devolucion`)
        .set('Authorization', `Bearer ${socioB.accessToken}`)
        .expect(404);

      // Socio A sí puede consultar y devolver su propio préstamo
      await request(server)
        .get(`/prestamos/${prestamoA.id}`)
        .set('Authorization', `Bearer ${socioA.accessToken}`)
        .expect(200);
      await request(server)
        .post(`/prestamos/${prestamoA.id}/devolucion`)
        .set('Authorization', `Bearer ${socioA.accessToken}`)
        .expect(200);
    });

    it('rechaza inmediatamente con 403 a un bibliotecario degradado aunque su token siga vigente', async () => {
      const server = app.getHttpServer();
      const { socio, accessToken } = await crearYLoguear(app, {
        nombre: 'Ex Biblio',
        email: 'exbiblio@uni.edu',
        contrasena: 'clave1234',
        rol: 'bibliotecario',
      });

      // Antes de degradar puede ver vencidos
      await request(server)
        .get('/prestamos/vencidos')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Degradamos al usuario en la base de datos mientras su token sigue vigente
      app.get(SociosService).cambiarRol(socio.id, 'socio');

      // En la siguiente petición con el MISMO token vigente, ya recibe 403
      await request(server)
        .get('/prestamos/vencidos')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });
  });

  describe('Consigna 5: Refresh token, detección de reutilización y logout', () => {
    it('rota el refresh token y revoca la familia completa si se reutiliza uno gastado', async () => {
      const server = app.getHttpServer();
      const { refreshToken: rt1 } = await crearYLoguear(app, {
        nombre: 'Rotación',
        email: 'rota@uni.edu',
        contrasena: 'clave1234',
      });

      // 1. Primer refresco: devuelve par nuevo (rt2)
      const resRefresh = await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: rt1 })
        .expect(200);

      const rt2 = resRefresh.body.refreshToken as string;
      expect(resRefresh.body.accessToken).toBeDefined();
      expect(rt2).not.toBe(rt1);

      // El nuevo accessToken funciona
      await request(server)
        .get('/libros')
        .set('Authorization', `Bearer ${resRefresh.body.accessToken}`)
        .expect(200);

      // 2. Reutilización maliciosa de rt1 (ya gastado): responde 401 y revoca toda la familia
      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: rt1 })
        .expect(401);

      // 3. El rt2 legítimo de la misma sesión también fue invalidado -> 401
      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: rt2 })
        .expect(401);
    });

    it('permite cerrar sesión de un dispositivo (logout) y de todos (logout-todos)', async () => {
      const server = app.getHttpServer();
      const sesion1 = await crearYLoguear(app, {
        nombre: 'Multi',
        email: 'multi@uni.edu',
        contrasena: 'clave1234',
      });

      // Segundo inicio de sesión en otro dispositivo para el mismo usuario
      const login2 = await request(server)
        .post('/auth/login')
        .send({ email: 'multi@uni.edu', contrasena: 'clave1234' })
        .expect(200);
      const sesion2 = {
        accessToken: login2.body.accessToken as string,
        refreshToken: login2.body.refreshToken as string,
      };

      // Logout de un solo dispositivo (sesion1)
      await request(server)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${sesion1.accessToken}`)
        .send({ refreshToken: sesion1.refreshToken })
        .expect(204);

      // sesion1 ya no puede refrescar
      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: sesion1.refreshToken })
        .expect(401);

      // sesion2 sigue activa y puede refrescar
      const refresco2 = await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: sesion2.refreshToken })
        .expect(200);

      // Abro una tercera sesión para probar logout-todos sobre múltiples sesiones activas
      const login3 = await request(server)
        .post('/auth/login')
        .send({ email: 'multi@uni.edu', contrasena: 'clave1234' })
        .expect(200);

      // Logout de todos los dispositivos
      await request(server)
        .post('/auth/logout-todos')
        .set('Authorization', `Bearer ${refresco2.body.accessToken}`)
        .expect(204);

      // Ninguna de las sesiones activas puede refrescar después de logout-todos
      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: refresco2.body.refreshToken })
        .expect(401);

      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: login3.body.refreshToken })
        .expect(401);
    });
  });
});
