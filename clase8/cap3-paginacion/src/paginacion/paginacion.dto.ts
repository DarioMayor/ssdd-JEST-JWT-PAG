import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export const PAGINA_POR_DEFECTO = 1;
export const LIMITE_POR_DEFECTO = 20;
export const LIMITE_MAXIMO = 100;

/**
 * Convierte un parámetro de query a número solo si fue enviado explícitamente,
 * conservando el valor por defecto del DTO cuando el parámetro se omite.
 */
export function normalizarNumeroQuery(
  valor: unknown,
  original: unknown,
): unknown {
  if (original === undefined) {
    return valor;
  }
  if (typeof original === 'number') {
    return original;
  }
  if (typeof original === 'string') {
    const limpio = original.trim();
    if (!limpio || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(limpio)) {
      return Number.NaN;
    }
    return Number(limpio);
  }
  return Number.NaN;
}

export class PaginacionDto {
  @IsOptional()
  @Transform(({ value, obj, key }) => normalizarNumeroQuery(value, obj?.[key]))
  @IsInt()
  @Min(1)
  pagina: number = PAGINA_POR_DEFECTO;

  @IsOptional()
  @Transform(({ value, obj, key }) => normalizarNumeroQuery(value, obj?.[key]))
  @IsInt()
  @Min(1)
  @Max(LIMITE_MAXIMO)
  limite: number = LIMITE_POR_DEFECTO;
}

export class CursorDto {
  @IsOptional()
  @Transform(({ value, obj, key }) => normalizarNumeroQuery(value, obj?.[key]))
  @IsInt()
  @Min(1)
  @Max(LIMITE_MAXIMO)
  limite: number = LIMITE_POR_DEFECTO;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  despues?: string;
}
