import { ConflictException, NotFoundException } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LibrosService } from '../libros/libros.service';
import { SociosService } from '../socios/socios.service';
import { PrestamosRepository } from './prestamos.repository';
import { PrestamosService } from './prestamos.service';

describe('PrestamosService', () => {
  let service: PrestamosService;        //Instancia real del servicio que vamos a probar, se declara aca pq la vamos a usar dsp dentro del test

  // Objetos falsos (mocks) para cada dependencia
  let repo: any;
  let libros: any;
  let socios: any;

  // Se ejecuta ANTES de cada prueba: todo arranca limpio
  beforeEach(async () => {
    repo = {                        //aca se crean los metodos falsos que vamos a usar en el test, con jest.fn() para poder espiar y controlar su comportamiento
      create: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      findActivosPorSocio: jest.fn(),
      save: jest.fn(),
    };
    libros = {
      findOne: jest.fn(),
      ajustarDisponibles: jest.fn(),
    };
    socios = {
      findOne: jest.fn(),
    };

    const modulo = await Test.createTestingModule({         //creacion del modulo de prueba, donde se inyectan las dependencias falsas
      providers: [
        PrestamosService, // el servicio REAL que queremos probar
        { provide: PrestamosRepository, useValue: repo },   // Cuando PrestamosService pida un PrestamosRepository, entrégale el objeto falso repo.
        { provide: LibrosService, useValue: libros },       // falso
        { provide: SociosService, useValue: socios },       // falso
      ],
    }).compile();

    service = modulo.get(PrestamosService);
  });

  it('lanza NotFoundException si el préstamo no existe', () => {
    // Preparar: el repo falso dice "no encontré nada"
    repo.findById.mockReturnValue(undefined);

    // Ejecutar y verificar
    expect(() => service.obtener(999)).toThrow(NotFoundException);
  });

  // --------- PRUEBAS DE LA FUNCIÓN prestar ----------------

    describe('prestar', () => {
    beforeEach(() => {
      // Reloj fijo: "hoy" es siempre el 1/3/2026 a las 10:00
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-03-01T10:00:00Z'));

      // Stubs: llevan el caso a "todo está OK para prestar"
      libros.findOne.mockReturnValue({ id: 1, disponibles: 1 });
      socios.findOne.mockReturnValue({ id: 1 });
      repo.findActivosPorSocio.mockReturnValue([]);
      repo.create.mockImplementation((datos: any) => ({ id: 1, ...datos }));
    });

    afterEach(() => {
      jest.useRealTimers(); // devolvemos el reloj real
    });

    it('vence a los 14 días si no se indica plazo', () => {
      // Act
      const prestamo = service.prestar({ libroId: 1, socioId: 1 });

      // Assert: 1/3 + 14 días = 15/3
      expect(prestamo.vencimiento).toBe('2026-03-15T10:00:00.000Z');
    });

    it('respeta el plazo indicado', () => {
      // Act
      const prestamo = service.prestar({ libroId: 1, socioId: 1, dias: 7 });

      // Assert: 1/3 + 7 días = 8/3
      expect(prestamo.vencimiento).toBe('2026-03-08T10:00:00.000Z');
    });

    it('acepta el plazo mínimo de 1 día', () => {
      const prestamo = service.prestar({ libroId: 1, socioId: 1, dias: 1 });

      expect(prestamo.vencimiento).toBe('2026-03-02T10:00:00.000Z');
    });

    it('acepta el plazo máximo de 30 días', () => {
      const prestamo = service.prestar({ libroId: 1, socioId: 1, dias: 30 });

      expect(prestamo.vencimiento).toBe('2026-03-31T10:00:00.000Z');
    });


    // Defecto corregido: el servicio permitía prestar libros con 0 disponibles (tenía < 0 en vez de <= 0)
    it('no se presta si el libro no tiene ejemplares disponibles', () => {
      libros.findOne.mockReturnValue({ id: 1, disponibles: 0 });
      expect(() => service.prestar({ libroId: 1, socioId: 1 })).toThrow(ConflictException);
    });

    // Defecto corregido: permitía pedir un 4to préstamo teniendo ya 3 activos (usaba > en vez de >= MAX_PRESTAMOS_ACTIVOS)
    it('no permite prestar si el socio ya tiene 3 préstamos activos', () => {
      // Arrange: simulamos que el socio ya tiene 3 préstamos activos
      repo.findActivosPorSocio.mockReturnValue([
        { id: 10 },
        { id: 11 },
        { id: 12 },
      ]);

      // Act & Assert: intentar pedir el 4to debe lanzar 409 ConflictException
      expect(() => service.prestar({ libroId: 1, socioId: 1 })).toThrow(
        ConflictException,
      );
    });
    
    it('descuenta un ejemplar disponible al prestar', () => {
      // Act
      service.prestar({ libroId: 1, socioId: 1 });

      // Assert: comprobamos que se llamó al servicio de libros para restar 1
      expect(libros.ajustarDisponibles).toHaveBeenCalledWith(1, -1);
    });

    it('lanza NotFoundException si el libro no existe', () => {
      // El servicio de libros lanza NotFoundException cuando no lo encuentra
      libros.findOne.mockImplementation(() => {
        throw new NotFoundException();
      });

      expect(() => service.prestar({ libroId: 999, socioId: 1 })).toThrow(
        NotFoundException,
      );
    });

    it('lanza NotFoundException si el socio no existe', () => {
      // El servicio de socios lanza NotFoundException cuando no lo encuentra
      socios.findOne.mockImplementation(() => {
        throw new NotFoundException();
      });

      expect(() => service.prestar({ libroId: 1, socioId: 999 })).toThrow(
        NotFoundException,
      );
    });

  });

// --------- PRUEBAS DE LA FUNCIÓN devolver ----------------

    describe('devolver', () => {
    const fechaVencimiento = '2026-03-15T10:00:00.000Z';

    beforeEach(() => {
      jest.useFakeTimers();
      // Empezamos fijando el reloj en el mismo momento del vencimiento
      jest.setSystemTime(new Date(fechaVencimiento));

      // Simulamos que el préstamo 1 existe, vence el 15/03 y no fue devuelto
      repo.findById.mockReturnValue({
        id: 1,
        libroId: 5,
        socioId: 2,
        vencimiento: fechaVencimiento,
        devueltoEn: null,
        multa: 0,
      });

      // repo.save simplemente devuelve el préstamo que recibe
      repo.save.mockImplementation((p: any) => p);
    });

    afterEach(() => {
      jest.useRealTimers();
    });


    it('devuelto a tiempo (en o antes del vencimiento) no tiene multa ($0)', () => {
      // Act
      const res = service.devolver(1);

      // Assert
      expect(res.multa).toBe(0);
      expect(res.devueltoEn).toBe(fechaVencimiento);
    });


    // Defecto corregido: la multa no cobraba fracciones de día porque usaba Math.floor en vez de Math.ceil
    it('cobra $100 de multa por una fracción de día de atraso (1 ms después)', () => {
      // Adelantamos el reloj a 1 milisegundo después del vencimiento
      const vencimientoMs = new Date(fechaVencimiento).getTime();
      jest.setSystemTime(new Date(vencimientoMs + 1));

      const res = service.devolver(1);

      // Según la regla: fracción de día ya paga $100
      expect(res.multa).toBe(100);
    });
    

    it('cobra $100 por exactamente 24 horas (1 día) de atraso', () => {
      const vencimientoMs = new Date(fechaVencimiento).getTime();
      const unDiaMs = 24 * 60 * 60 * 1000;
      // Exactamente 24 horas después
      jest.setSystemTime(new Date(vencimientoMs + unDiaMs));

      const res = service.devolver(1);
      expect(res.multa).toBe(100);
    });


    it('cobra $200 por 1 día y 1 ms de atraso (segundo día iniciado)', () => {
      const vencimientoMs = new Date(fechaVencimiento).getTime();
      const unDiaMs = 24 * 60 * 60 * 1000;
      // 24 horas y 1 milisegundo después
      jest.setSystemTime(new Date(vencimientoMs + unDiaMs + 1));

      const res = service.devolver(1);
      expect(res.multa).toBe(200);
    });


    it('lanza ConflictException si el préstamo ya fue devuelto', () => {
      // Arrange: el préstamo ya tiene una fecha de devolución cargada
      repo.findById.mockReturnValue({
        id: 1,
        libroId: 5,
        socioId: 2,
        vencimiento: fechaVencimiento,
        devueltoEn: '2026-03-10T10:00:00.000Z',
        multa: 0,
      });

      // Act & Assert
      expect(() => service.devolver(1)).toThrow(ConflictException);
    });

    // Defecto corregido: al devolver no se reponía el ejemplar disponible (faltaba llamar a libros.ajustarDisponibles)
    it('repone el ejemplar disponible en la biblioteca al devolver', () => {
      // Act
      service.devolver(1);

      // Assert: libroId era 5, así que debe sumar 1 ejemplar (+1)
      expect(libros.ajustarDisponibles).toHaveBeenCalledWith(5, 1);
    });


  });

});
