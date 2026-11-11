import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CursorDto } from '../paginacion/paginacion.dto';
import { ActualizarLibroDto } from './dto/actualizar-libro.dto';
import { ConsultaLibrosDto } from './dto/consulta-libros.dto';
import { CrearLibroDto } from './dto/crear-libro.dto';
import { LibrosService } from './libros.service';

@Controller('libros')
export class LibrosController {
  constructor(private readonly service: LibrosService) {}

  @Post()
  create(@Body() dto: CrearLibroDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() consulta: ConsultaLibrosDto) {
    return this.service.findAll(consulta);
  }

  @Get('cursor')
  listarPorCursor(@Query() consulta: CursorDto) {
    return this.service.listarPorCursor(consulta);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarLibroDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    this.service.remove(id);
  }
}
