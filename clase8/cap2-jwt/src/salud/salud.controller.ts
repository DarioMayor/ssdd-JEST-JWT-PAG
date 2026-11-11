import { Public } from '@nestjs/authentication';
import { Controller, Get } from '@nestjs/common';

@Controller('salud')
export class SaludController {
  @Public()
  @Get()
  estado() {
    return { estado: 'ok', instancia: process.env.INSTANCIA ?? 'local' };
  }
}
