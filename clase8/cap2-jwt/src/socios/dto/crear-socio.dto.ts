import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { RolSocio } from '../entities/socio.entity';

export class CrearSocioDto {
  @IsString()
  @MinLength(2)
  nombre: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  contrasena: string;

  @IsOptional()
  @IsIn(['socio', 'bibliotecario'])
  rol?: RolSocio = 'socio';
}