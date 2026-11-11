import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { PaginacionDto } from '../paginacion/paginacion.dto';
import { CrearSocioDto } from './dto/crear-socio.dto';
import { SociosService } from './socios.service';

@Controller('socios')
export class SociosController {
  constructor(private readonly service: SociosService) {}

  @Post()
  create(@Body() dto: CrearSocioDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() consulta: PaginacionDto) {
    return this.service.findAll(consulta);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
}
