import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  normalizarNumeroQuery,
  PaginacionDto,
} from '../../paginacion/paginacion.dto';

export const CAMPOS_ORDEN_LIBRO = [
  'id',
  'titulo',
  'autor',
  'anio',
  'categoria',
  'disponibles',
] as const;

export type CampoOrdenLibro = (typeof CAMPOS_ORDEN_LIBRO)[number];

export const DIRECCIONES_ORDEN = ['asc', 'desc'] as const;
export type DireccionOrden = (typeof DIRECCIONES_ORDEN)[number];

export class ConsultaLibrosDto extends PaginacionDto {
  @IsOptional()
  @IsIn(CAMPOS_ORDEN_LIBRO)
  ordenarPor: CampoOrdenLibro = 'id';

  @IsOptional()
  @Transform(({ value, obj, key }) =>
    obj?.[key] === undefined
      ? value
      : typeof obj[key] === 'string'
        ? obj[key].trim().toLowerCase()
        : obj[key],
  )
  @IsIn(DIRECCIONES_ORDEN)
  direccion: DireccionOrden = 'asc';

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  categoria?: string;

  @IsOptional()
  @Transform(({ value, obj, key }) => normalizarNumeroQuery(value, obj?.[key]))
  @IsInt()
  @Min(1)
  @Max(2100)
  anioDesde?: number;

  @IsOptional()
  @Transform(({ value, obj, key }) => normalizarNumeroQuery(value, obj?.[key]))
  @IsInt()
  @Min(1)
  @Max(2100)
  anioHasta?: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  buscar?: string;
}
