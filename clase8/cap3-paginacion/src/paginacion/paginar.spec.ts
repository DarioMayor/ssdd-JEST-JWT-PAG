import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SelectQueryBuilder } from 'typeorm';
import { ConsultaLibrosDto } from '../libros/dto/consulta-libros.dto';
import { ConsultaPrestamosDto } from '../prestamos/dto/consulta-prestamos.dto';
import {
  CursorDto,
  LIMITE_MAXIMO,
  LIMITE_POR_DEFECTO,
  normalizarNumeroQuery,
  PAGINA_POR_DEFECTO,
  PaginacionDto,
} from './paginacion.dto';
import {
  codificarCursor,
  decodificarCursor,
  escaparLike,
  paginar,
  paginarPorCursor,
} from './paginar';

interface EntidadMock {
  id: number;
  titulo: string;
}

function crearMockQueryBuilder<T extends object>(resultadoManyAndCount?: [T[], number], resultadoMany?: T[]) {
  const qb = {
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn<() => Promise<[T[], number]>>().mockResolvedValue(
      resultadoManyAndCount ?? [[], 0],
    ),
    getMany: jest.fn<() => Promise<T[]>>().mockResolvedValue(resultadoMany ?? []),
  };
  return qb as unknown as SelectQueryBuilder<T> & typeof qb;
}

describe('Paginación - DTOs y normalización', () => {
  it('normalizarNumeroQuery conserva el valor por defecto si no se envió parámetro', () => {
    expect(normalizarNumeroQuery(1, undefined)).toBe(1);
    expect(normalizarNumeroQuery(undefined, undefined)).toBeUndefined();
  });

  it('normalizarNumeroQuery parsea strings válidos y marca inválidos como NaN', () => {
    expect(normalizarNumeroQuery('15', '15')).toBe(15);
    expect(normalizarNumeroQuery(' 7 ', ' 7 ')).toBe(7);
    expect(normalizarNumeroQuery(1.5, '1.5')).toBe(1.5);
    expect(normalizarNumeroQuery('', '')).toBeNaN();
    expect(normalizarNumeroQuery('abc', 'abc')).toBeNaN();
    expect(normalizarNumeroQuery('0x10', '0x10')).toBeNaN();
    expect(normalizarNumeroQuery(['1', '2'], ['1', '2'])).toBeNaN();
  });

  it('PaginacionDto aplica valores por defecto cuando faltan parámetros', async () => {
    const dto = plainToInstance(PaginacionDto, {});
    const errores = await validate(dto);

    expect(errores).toHaveLength(0);
    expect(dto.pagina).toBe(PAGINA_POR_DEFECTO);
    expect(dto.limite).toBe(LIMITE_POR_DEFECTO);
  });

  it('PaginacionDto rechaza valores inválidos o fuera de rango', async () => {
    const casosInvalidos = [
      { pagina: '0' },
      { pagina: '-1' },
      { pagina: '1.5' },
      { pagina: 'abc' },
      { pagina: '' },
      { limite: '0' },
      { limite: String(LIMITE_MAXIMO + 1) },
      { limite: 'no-num' },
    ];

    for (const caso of casosInvalidos) {
      const dto = plainToInstance(PaginacionDto, caso);
      const errores = await validate(dto);
      expect(errores.length).toBeGreaterThan(0);
    }
  });

  it('ConsultaLibrosDto valida campos de ordenamiento, dirección y filtros', async () => {
    const valido = plainToInstance(ConsultaLibrosDto, {
      ordenarPor: 'anio',
      direccion: 'DESC',
      categoria: '  Novela  ',
      anioDesde: '1950',
      anioHasta: '2000',
      buscar: '  Borges ',
    });
    expect(await validate(valido)).toHaveLength(0);
    expect(valido.direccion).toBe('desc');
    expect(valido.categoria).toBe('Novela');
    expect(valido.buscar).toBe('Borges');
    expect(valido.anioDesde).toBe(1950);

    const ordenInvalido = plainToInstance(ConsultaLibrosDto, {
      ordenarPor: 'claveSecreta',
    });
    expect((await validate(ordenInvalido)).length).toBeGreaterThan(0);

    const dirInvalida = plainToInstance(ConsultaLibrosDto, {
      direccion: 'aleatorio',
    });
    expect((await validate(dirInvalida)).length).toBeGreaterThan(0);
  });

  it('CursorDto y ConsultaPrestamosDto validan parámetros correctamente', async () => {
    const cursorVacio = plainToInstance(CursorDto, { despues: '' });
    expect((await validate(cursorVacio)).length).toBeGreaterThan(0);

    const prestamoValido = plainToInstance(ConsultaPrestamosDto, {
      socioId: '12',
      estado: 'VENCIDO',
    });
    expect(await validate(prestamoValido)).toHaveLength(0);
    expect(prestamoValido.estado).toBe('vencido');
    expect(prestamoValido.socioId).toBe(12);

    const prestamoInvalido = plainToInstance(ConsultaPrestamosDto, {
      estado: 'perdido',
    });
    expect((await validate(prestamoInvalido)).length).toBeGreaterThan(0);
  });
});

describe('paginar() - offset y metadatos', () => {
  it('calcula skip, take, totalPaginas y usa id ASC por defecto sin duplicar addOrderBy', async () => {
    const filas: EntidadMock[] = [
      { id: 11, titulo: 'A' },
      { id: 12, titulo: 'B' },
    ];
    const qb = crearMockQueryBuilder<EntidadMock>([filas, 25]);
    const dto = plainToInstance(PaginacionDto, { pagina: '2', limite: '10' });

    const resultado = await paginar(qb, 'libro', dto);

    expect(qb.orderBy).toHaveBeenCalledWith('libro.id', 'ASC');
    expect(qb.addOrderBy).not.toHaveBeenCalled();
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(resultado).toEqual({
      datos: filas,
      meta: {
        total: 25,
        pagina: 2,
        limite: 10,
        totalPaginas: 3,
      },
    });
  });

  it('agrega desempate determinístico por id ASC al ordenar por otro campo', async () => {
    const qb = crearMockQueryBuilder<EntidadMock>([[], 0]);
    const dto = plainToInstance(PaginacionDto, { pagina: '1', limite: '20' });

    const resultado = await paginar(qb, 'libro', dto, {
      columna: 'libro.titulo',
      direccion: 'DESC',
    });

    expect(qb.orderBy).toHaveBeenCalledWith('libro.titulo', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('libro.id', 'ASC');
    expect(resultado.meta).toEqual({
      total: 0,
      pagina: 1,
      limite: 20,
      totalPaginas: 0,
    });
  });
});

describe('Cursor - codificación, decodificación y paginarPorCursor()', () => {
  it('codifica y decodifica un payload en base64url opaco', () => {
    const token = codificarCursor({ t: 'Rayuela', id: 42 });

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodificarCursor(token)).toEqual({ t: 'Rayuela', id: 42 });
  });

  it('rechaza cursores corruptos o con estructura inválida con BadRequestException', () => {
    const invalidos = [
      '',
      'no-es-base64!!!',
      Buffer.from('no es json').toString('base64url'),
      Buffer.from(JSON.stringify(['a', 1])).toString('base64url'),
      Buffer.from(JSON.stringify({ t: 123, id: 1 })).toString('base64url'),
      Buffer.from(JSON.stringify({ t: 'Hola', id: 0 })).toString('base64url'),
      Buffer.from(JSON.stringify({ t: 'Hola', id: 1.5 })).toString('base64url'),
      Buffer.from(JSON.stringify({ t: 'Hola', id: 1, extra: true })).toString('base64url'),
    ];

    for (const token of invalidos) {
      expect(() => decodificarCursor(token)).toThrow(BadRequestException);
    }
  });

  it('pide limite + 1 filas y devuelve siguiente cursor solo cuando hay más páginas', async () => {
    const filasMasUno: EntidadMock[] = [
      { id: 1, titulo: 'A' },
      { id: 2, titulo: 'A' },
      { id: 3, titulo: 'B' },
    ];
    const qbConMas = crearMockQueryBuilder<EntidadMock>(undefined, filasMasUno);
    const dto1 = plainToInstance(CursorDto, { limite: '2' });

    const pagina1 = await paginarPorCursor(qbConMas, 'libro', 'titulo', dto1);

    expect(qbConMas.orderBy).toHaveBeenCalledWith('libro.titulo', 'ASC');
    expect(qbConMas.addOrderBy).toHaveBeenCalledWith('libro.id', 'ASC');
    expect(qbConMas.take).toHaveBeenCalledWith(3);
    expect(pagina1.datos).toEqual([
      { id: 1, titulo: 'A' },
      { id: 2, titulo: 'A' },
    ]);
    expect(decodificarCursor(pagina1.siguiente!)).toEqual({ t: 'A', id: 2 });

    const qbFinal = crearMockQueryBuilder<EntidadMock>(undefined, [{ id: 3, titulo: 'B' }]);
    const dto2 = plainToInstance(CursorDto, { limite: '2', despues: pagina1.siguiente! });

    const pagina2 = await paginarPorCursor(qbFinal, 'libro', 'titulo', dto2);

    expect(qbFinal.andWhere).toHaveBeenCalledWith(
      '(libro.titulo > :cursorValor OR (libro.titulo = :cursorValor AND libro.id > :cursorId))',
      { cursorValor: 'A', cursorId: 2 },
    );
    expect(pagina2).toEqual({
      datos: [{ id: 3, titulo: 'B' }],
      siguiente: null,
    });
  });

  it('escaparLike escapa comodines SQL con !', () => {
    expect(escaparLike('100%_cuidado!')).toBe('100!%!_cuidado!!');
  });
});
