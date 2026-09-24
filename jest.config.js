/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  // Fijar TZ=UTC por defecto (igual que Vercel producción).
  // Para validar con America/Bogota usar: npm run test:tz-bogota
  setupFiles: ['<rootDir>/jest.setup.tz.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Tipos y helpers de impresión compartidos con el print-agent (tsconfig `paths`).
    '^@printing$': '<rootDir>/print-agent/src/printing/index.ts',
    '^@printing/(.*)$': '<rootDir>/print-agent/src/printing/$1',
    // F7: sanitize-html trae htmlparser2@12 (solo ESM, jest CJS no lo carga);
    // solo usa `Parser`, que existe igual en htmlparser2@8 (CJS, top-level).
    '^htmlparser2$': '<rootDir>/node_modules/htmlparser2/lib/index.js',
  },
  // `tsconfig.jest.json` = tsconfig.json con `jsx: react-jsx`: las pruebas de
  // render (`.test.tsx` con el docblock `@jest-environment jsdom`, Testing
  // Library, POS-PLAN D9) necesitan JSX compilado; Next usa `preserve`.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
    // next-intl y sus dependencias solo publican ESM: se transpilan para que
    // las pruebas de render usen el proveedor real con messages/*.json.
    'node_modules[\\\\/].+\\.m?js$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
  transformIgnorePatterns: ['/node_modules/(?!(next-intl|use-intl|intl-messageformat|@formatjs|@schummar)/)'],
  // Ignorar módulos que dependen de Supabase/browser APIs en los tests
  // (se mockean individualmente en cada test).
  testPathIgnorePatterns: ['/node_modules/', '/mobile/', '/print-agent/'],
}

module.exports = config
