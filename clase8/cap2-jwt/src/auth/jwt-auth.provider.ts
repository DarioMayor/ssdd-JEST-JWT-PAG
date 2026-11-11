import {
  AuthenticationRegistry,
  JwtBearerProvider,
  type JwtClaims,
} from '@nestjs/authentication';
import { Injectable } from '@nestjs/common';
import { SociosService, type SocioPublico } from '../socios/socios.service';

@Injectable()
export class JwtAuth extends JwtBearerProvider<SocioPublico> {
  constructor(
    private readonly socios: SociosService,
    registry: AuthenticationRegistry,
  ) {
    super(); // verifica los tokens firmados con la configuración de accessToken del módulo
    registry.registerProvider(this);
  }

  validate({ sub }: JwtClaims): SocioPublico | null {
    if (!sub) return null;
    try {
      return this.socios.findOne(Number(sub));
    } catch {
      return null; // si el socio ya no existe, se rechaza el token (401)
    }
  }
}
