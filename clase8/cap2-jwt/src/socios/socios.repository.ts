import { Injectable } from '@nestjs/common';
import { Socio } from './entities/socio.entity';

@Injectable()
export class SociosRepository {
  private socios: Socio[] = [];
  private siguienteId = 1;

  create(datos: Omit<Socio, 'id'>): Socio {
    const socio: Socio = { id: this.siguienteId++, ...datos };
    this.socios.push(socio);
    return socio;
  }

  findAll(): Socio[] {
    return [...this.socios];
  }

  findById(id: number): Socio | undefined {
    return this.socios.find((s) => s.id === id);
  }

  findByEmail(email: string): Socio | undefined {
    return this.socios.find((s) => s.email === email);
  }
}