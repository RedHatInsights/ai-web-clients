const { workspaceRoot } = require('@nx/devkit');

module.exports = {
  displayName: {
    name: 'ai-web-clients',
    color: 'magentaBright',
  },
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/vendor/**',
  ],
  roots: [`<rootDir>/packages`],
  testMatch: [
    '<rootDir>/packages/**/__tests__/**/*.(j|t)s?(x)',
    '<rootDir>/packages/**/*(*.)@(spec|test).(j|t)s?(x)',
  ],
  resolver: '@nx/jest/plugins/resolver',
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/packages/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
}; 