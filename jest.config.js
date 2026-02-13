export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^steps/(.*)$': '<rootDir>/steps/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  testMatch: [
    '**/tests/unit/**/*.test.ts',
    '**/tests/integration/**/*.test.ts',
    '**/tests/debug/**/*.test.ts',
    '**/tests/performance/**/*.test.ts',
    '**/tests/e2e/**/*.test.ts',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/integration/e2e.test.ts', // Legacy E2E test
    '/tests/e2e/', // E2E tests require running server and LLM API keys
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    'steps/**/*.ts',
    '!**/*.test.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testTimeout: 60000,
  detectOpenHandles: true,
  forceExit: true,
};
