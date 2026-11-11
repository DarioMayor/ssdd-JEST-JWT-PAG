import { AuthenticationContext } from '@nestjs/authentication';
import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import type { RolSocio } from '../socios/entities/socio.entity';
import type { SocioPublico } from '../socios/socios.service';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly authContext: AuthenticationContext<SocioPublico>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const rolesRequeridos = this.reflector.getAllAndOverride<RolSocio[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!rolesRequeridos || rolesRequeridos.length === 0) {
      return next.handle();
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: SocioPublico }>();
    const usuario = this.authContext.user ?? request.user;

    if (!usuario || !rolesRequeridos.includes(usuario.rol)) {
      throw new ForbiddenException('No tiene permisos para esta operación');
    }

    return next.handle();
  }
}
