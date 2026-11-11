import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SociosModule } from '../socios/socios.module';
import { AuthController } from './auth.controller';
import { JwtAuth } from './jwt-auth.provider';
import { RolesInterceptor } from './roles.interceptor';

@Module({
  imports: [SociosModule],
  controllers: [AuthController],
  providers: [
    JwtAuth,
    { provide: APP_INTERCEPTOR, useClass: RolesInterceptor },
  ],
})
export class AuthModule {}
