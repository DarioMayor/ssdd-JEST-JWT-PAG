import { CurrentUser } from '@nestjs/authentication';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import type { SocioPublico } from '../socios/socios.service';
import { CrearPrestamoDto } from './dto/crear-prestamo.dto';
import { PrestamosService } from './prestamos.service';

@Controller('prestamos')
export class PrestamosController {
  constructor(private readonly service: PrestamosService) {}

  @Post()
  prestar(
    @CurrentUser() usuario: SocioPublico,
    @Body() dto: CrearPrestamoDto,
  ) {
    return this.service.prestar(dto, usuario.id);
  }

  @Get()
  listar(@CurrentUser() usuario: SocioPublico) {
    return this.service.listar(usuario);
  }

  @Roles('bibliotecario')
  @Get('vencidos')
  vencidos() {
    return this.service.listarVencidos();
  }

  @Get(':id')
  obtener(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: SocioPublico,
  ) {
    return this.service.obtener(id, usuario);
  }

  @Post(':id/devolucion')
  @HttpCode(200)
  devolver(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: SocioPublico,
  ) {
    return this.service.devolver(id, usuario);
  }
}
