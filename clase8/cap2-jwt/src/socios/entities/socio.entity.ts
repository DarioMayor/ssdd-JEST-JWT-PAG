export type RolSocio = 'socio' | 'bibliotecario';

export class Socio {
  id: number;
  nombre: string;
  email: string;
  rol: RolSocio;
  contrasenaHash: string;
}