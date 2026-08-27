/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  // Ignorar módulos que dependen de Supabase/browser APIs en los tests
  // (se mockean individualmente en cada test).
  testPathIgnorePatterns: ['/node_modules/', '/mobile/', '/print-agent/'],
}

module.exports = config
