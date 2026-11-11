import {
  CurrentUser,
  PasswordHasher,
  Public,
  TokenService,
} from '@nestjs/authentication';
import {
  Body,
  Controller,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { SociosService, type SocioPublico } from '../socios/socios.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly socios: SociosService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto) {
    const socio = this.socios.findByEmailConHash(dto.email);
    const valida =
      socio !== undefined &&
      (await this.hasher.verify(dto.contrasena, socio.contrasenaHash));

    if (!valida) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.tokens.issue(String(socio.id), {
      claims: {
        email: socio.email,
        rol: socio.rol,
      },
      method: 'password',
    });
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.tokens.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshTokenDto) {
    await this.tokens.revoke(dto.refreshToken);
  }

  @Post('logout-todos')
  @HttpCode(204)
  async logoutTodos(@CurrentUser() usuario: SocioPublico) {
    await this.tokens.revokeAll(String(usuario.id));
  }
}
