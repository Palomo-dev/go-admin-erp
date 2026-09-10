/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // F7: sanitize-html trae htmlparser2@12 (solo ESM, jest CJS no lo carga);
    // solo usa `Parser`, que existe igual en htmlparser2@8 (CJS, top-level).
    '^htmlparser2$': '<rootDir>/node_modules/htmlparser2/lib/index.js',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  // Ignorar módulos que dependen de Supabase/browser APIs en los tests
  // (se mockean individualmente en cada test).
  testPathIgnorePatterns: ['/node_modules/', '/mobile/', '/print-agent/'],
}

module.exports = config
