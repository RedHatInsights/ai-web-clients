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
  resolver: '@nx/jest/plugins/resolver',
  setupFilesAfterEnv: [`${workspaceRoot}/jest.setup.js`],
}; 