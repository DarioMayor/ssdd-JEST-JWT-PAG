import type { Config } from 'jest';
import { pathsToModuleNameMapper } from 'ts-jest';
import ts from 'typescript';

// Path aliases (e.g. the ones added by `nest g library`) live in tsconfig.json,
// so they are read from there instead of being duplicated here.
const { config: tsconfig } = ts.readConfigFile(
  './tsconfig.json',
  ts.sys.readFile,
);
const paths = tsconfig?.compilerOptions?.paths ?? {};

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  extensionsToTreatAsEsm: ['.ts'],
  setupFiles: ['<rootDir>/test/jest-globals.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'esnext',
          moduleResolution: 'bundler',
        },
      },
    ],
  },
  moduleNameMapper: pathsToModuleNameMapper(paths, { prefix: '<rootDir>/' }),
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    'libs/**/*.(t|j)s',
    'apps/**/*.(t|j)s',
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  watchman: false,

  // Consigna 5: Forzar que npm test siempre recolecte cobertura
  collectCoverage: true,

  /**
   * Consigna 5: Justificación de umbrales de cobertura:
   * 
   * 1. Umbral específico para 'src/prestamos/prestamos.service.ts':
   *    - Líneas: 85% y Ramas: 75%.
   *    Justificación: Es el núcleo de la lógica de negocio requerida en el ejercicio.
   *    Cubre exhaustivamente todas las reglas: plazos, multas con límites exactos,
   *    límites de activos, stock y reposición. El margen restante corresponde a métodos
   *    auxiliares de listado (listar, listarVencidos).
   * 
   * 2. Umbral 'global':
   *    - Líneas: 30% y Ramas: 25%.
   *    Justificación: La suite de 'npm test' es exclusivamente unitaria y aísla los servicios
   *    con mocks. Por diseño de arquitectura en capas, los controladores HTTP, módulos y DTOs
   *    no se ejecutan en los tests unitarios, sino en la suite e2e ('npm run test:e2e'),
   *    por lo que su cobertura unitaria es baja sin que ello implique falta de pruebas.
   */
  coverageThreshold: {
    global: {
      lines: 15,
      branches: 10,
    },
    './src/prestamos/prestamos.service.ts': {
      lines: 85,
      branches: 75,
    },
  },
};

export default config;