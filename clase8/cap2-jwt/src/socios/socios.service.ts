import { PasswordHasher } from '@nestjs/authentication';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CrearSocioDto } from './dto/crear-socio.dto';
import { Socio, type RolSocio } from './entities/socio.entity';
import { SociosRepository } from './socios.repository';

export type SocioPublico = Omit<Socio, 'contrasenaHash'>;

@Injectable()
export class SociosService {
  constructor(
    private readonly repo: SociosRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  private sinContrasena(socio: Socio): SocioPublico {
    const { contrasenaHash: _, ...publico } = socio;
    return publico;
  }

  async create(dto: CrearSocioDto): Promise<SocioPublico> {
    if (this.repo.findByEmail(dto.email)) {
      throw new ConflictException('Ya existe un socio con ese email');
    }
    const contrasenaHash = await this.hasher.hash(dto.contrasena);
    const socio = this.repo.create({
      nombre: dto.nombre,
      email: dto.email,
      rol: dto.rol ?? 'socio',
      contrasenaHash,
    });
    return this.sinContrasena(socio);
  }

  findAll(): SocioPublico[] {
    return this.repo.findAll().map((s) => this.sinContrasena(s));
  }

  findOne(id: number): SocioPublico {
    const socio = this.repo.findById(id);
    if (!socio) throw new NotFoundException(`El socio ${id} no existe`);
    return this.sinContrasena(socio);
  }

  // Solo para que el módulo de auth verifique la contraseña al hacer login
  findByEmailConHash(email: string): Socio | undefined {
    return this.repo.findByEmail(email);
  }

  cambiarRol(id: number, rol: RolSocio): SocioPublico {
    const socio = this.repo.findById(id);
    if (!socio) throw new NotFoundException(`El socio ${id} no existe`);
    socio.rol = rol;
    return this.sinContrasena(socio);
  }
}