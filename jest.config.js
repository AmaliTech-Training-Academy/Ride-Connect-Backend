/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/scripts/**/*.test.js',
  ],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts', '!src/**/*.test.ts'],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },
};
