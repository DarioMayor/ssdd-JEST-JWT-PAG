import { AuthenticationModule, type Duration } from '@nestjs/authentication';
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { LibrosModule } from './libros/libros.module';
import { PrestamosModule } from './prestamos/prestamos.module';
import { SaludController } from './salud/salud.controller';
import { SociosModule } from './socios/socios.module';

function leerTtl(): Duration {
  const valor = process.env.JWT_TTL;
  if (!valor) return '15m';
  return /^\d+$/.test(valor) ? Number(valor) : (valor as Duration);
}

@Module({
  imports: [
    AuthenticationModule.forRootAsync({
      useFactory: () => ({
        allowInMemoryStorage: true,
        accessToken: {
          key:
            process.env.JWT_SECRET ??
            (process.env.NODE_ENV === 'production'
              ? ''
              : 'secreto-desarrollo-biblioteca-al-menos-32-bytes'),
          issuer: process.env.JWT_ISSUER ?? 'https://biblioteca.uni.edu',
          audience: 'biblioteca-api',
          ttl: leerTtl(),
        },
      }),
    }),
    AuthModule,
    LibrosModule,
    SociosModule,
    PrestamosModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}
