import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CrearPrestamoDto {
  @IsInt()
  @Min(1)
  libroId: number;

  // Plazo en días (por defecto, 14)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  dias?: number;
}
