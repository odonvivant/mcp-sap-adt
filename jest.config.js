/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/**/*.test.ts', '**/scripts/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    'scripts/**/*.ts',
    '!src/**/*.test.ts',
    '!scripts/**/*.test.ts',
    '!src/gateway/FakeAdtGateway.ts',
  ],
};
