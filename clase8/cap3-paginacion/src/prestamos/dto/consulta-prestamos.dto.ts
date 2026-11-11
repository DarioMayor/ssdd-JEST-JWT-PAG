import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import {
  normalizarNumeroQuery,
  PaginacionDto,
} from '../../paginacion/paginacion.dto';

export const ESTADOS_PRESTAMO = ['activo', 'devuelto', 'vencido'] as const;
export type EstadoPrestamo = (typeof ESTADOS_PRESTAMO)[number];

export class ConsultaPrestamosDto extends PaginacionDto {
  @IsOptional()
  @Transform(({ value, obj, key }) => normalizarNumeroQuery(value, obj?.[key]))
  @IsInt()
  @Min(1)
  socioId?: number;

  @IsOptional()
  @Transform(({ value, obj, key }) =>
    obj?.[key] === undefined
      ? value
      : typeof obj[key] === 'string'
        ? obj[key].trim().toLowerCase()
        : obj[key],
  )
  @IsIn(ESTADOS_PRESTAMO)
  estado?: EstadoPrestamo;
}
