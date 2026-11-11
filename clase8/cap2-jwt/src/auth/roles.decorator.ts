import { SetMetadata } from '@nestjs/common';
import type { RolSocio } from '../socios/entities/socio.entity';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: RolSocio[]) => SetMetadata(ROLES_KEY, roles);
