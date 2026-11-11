import { AuthenticationContext } from '@nestjs/authentication';
import { CallHandler, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { RolesInterceptor } from './roles.interceptor';

describe('RolesInterceptor', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let authContext: { user: any };
  let interceptor: RolesInterceptor;

  const mockExecutionContext = (user?: any) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  const mockNext = (): CallHandler => ({
    handle: jest.fn().mockReturnValue(of('ok')),
  });

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    authContext = { user: null };
    interceptor = new RolesInterceptor(
      reflector as unknown as Reflector,
      authContext as unknown as AuthenticationContext<any>,
    );
  });

  it('deja pasar si la ruta no requiere roles', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const next = mockNext();

    interceptor.intercept(mockExecutionContext(), next);

    expect(next.handle).toHaveBeenCalled();
  });

  it('deja pasar si el usuario tiene el rol requerido', () => {
    reflector.getAllAndOverride.mockReturnValue(['bibliotecario']);
    authContext.user = { id: 1, rol: 'bibliotecario' };
    const next = mockNext();

    interceptor.intercept(mockExecutionContext(), next);

    expect(next.handle).toHaveBeenCalled();
  });

  it('lanza ForbiddenException si el usuario no tiene el rol requerido', () => {
    reflector.getAllAndOverride.mockReturnValue(['bibliotecario']);
    authContext.user = { id: 2, rol: 'socio' };

    expect(() =>
      interceptor.intercept(mockExecutionContext(), mockNext()),
    ).toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException si no hay usuario autenticado', () => {
    reflector.getAllAndOverride.mockReturnValue(['bibliotecario']);

    expect(() =>
      interceptor.intercept(mockExecutionContext(), mockNext()),
    ).toThrow(ForbiddenException);
  });
});
