import { Public } from '@nestjs/authentication';
import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CrearSocioDto } from './dto/crear-socio.dto';
import { SociosService } from './socios.service';

@Controller('socios')
export class SociosController {
  constructor(private readonly service: SociosService) {}

  @Public()
  @Post()
  create(@Body() dto: CrearSocioDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
}
