import { BadRequestException } from '@nestjs/common';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { CursorDto, PaginacionDto } from './paginacion.dto';

export interface MetaPaginacion {
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
}

export interface PaginaResultado<T> {
  datos: T[];
  meta: MetaPaginacion;
}

export interface CursorResultado<T> {
  datos: T[];
  siguiente: string | null;
}

export interface OpcionesOrden {
  columna: string;
  direccion: 'ASC' | 'DESC';
}

export interface PayloadCursor {
  t: string;
  id: number;
}

const REGEX_BASE64URL = /^[A-Za-z0-9_-]+$/;

export function escaparLike(texto: string): string {
  return texto.replace(/[!%_]/g, '!$&');
}

export function codificarCursor(payload: PayloadCursor): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodificarCursor(token: string): PayloadCursor {
  if (!token || !REGEX_BASE64URL.test(token)) {
    throw new BadRequestException('Cursor inválido');
  }

  let parsed: unknown;
  try {
    const json = Buffer.from(token, 'base64url').toString('utf8');
    parsed = JSON.parse(json);
  } catch {
    throw new BadRequestException('Cursor inválido');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length !== 2
  ) {
    throw new BadRequestException('Cursor inválido');
  }

  const { t, id } = parsed as Partial<PayloadCursor>;
  if (typeof t !== 'string' || typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
    throw new BadRequestException('Cursor inválido');
  }

  return { t, id };
}

/**
 * Aplica ordenamiento determinístico (siempre desempata por id ASC)
 * y paginación por offset sobre cualquier SelectQueryBuilder de TypeORM.
 */
export async function paginar<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  dto: PaginacionDto,
  orden: OpcionesOrden = { columna: `${alias}.id`, direccion: 'ASC' },
): Promise<PaginaResultado<T>> {
  const { pagina, limite } = dto;
  const columnaId = `${alias}.id`;

  qb.orderBy(orden.columna, orden.direccion);
  if (orden.columna !== columnaId) {
    qb.addOrderBy(columnaId, 'ASC');
  }

  const [datos, total] = await qb
    .skip((pagina - 1) * limite)
    .take(limite)
    .getManyAndCount();

  return {
    datos,
    meta: {
      total,
      pagina,
      limite,
      totalPaginas: Math.ceil(total / limite),
    },
  };
}

/**
 * Paginación keyset por cursor ordenado de forma determinística por `(campo, id) ASC`.
 */
export async function paginarPorCursor<T extends ObjectLiteral & { id: number }>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  campo: keyof T & string,
  dto: CursorDto,
): Promise<CursorResultado<T>> {
  const columnaCampo = `${alias}.${campo}`;
  const columnaId = `${alias}.id`;

  if (dto.despues !== undefined) {
    const cursor = decodificarCursor(dto.despues);
    qb.andWhere(
      `(${columnaCampo} > :cursorValor OR (${columnaCampo} = :cursorValor AND ${columnaId} > :cursorId))`,
      { cursorValor: cursor.t, cursorId: cursor.id },
    );
  }

  qb.orderBy(columnaCampo, 'ASC').addOrderBy(columnaId, 'ASC').take(dto.limite + 1);

  const filas = await qb.getMany();
  const hayMas = filas.length > dto.limite;
  const datos = hayMas ? filas.slice(0, dto.limite) : filas;

  const ultimo = datos.at(-1);
  const siguiente =
    hayMas && ultimo
      ? codificarCursor({ t: String(ultimo[campo]), id: ultimo.id })
      : null;

  return { datos, siguiente };
}
