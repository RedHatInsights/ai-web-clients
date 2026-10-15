import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import js from '@eslint/js';
import baseConfig from '../../eslint.config.mjs';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
  recommendedConfig: js.configs.recommended,
});

export default [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    // Override or add rules here
    rules: {},
  },
  ...compat
    .config({
      env: {
        node: true,
        commonjs: true,
        es6: true,
      },
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'script',
      },
    })
    .map((config) => ({
      ...config,
      files: ['**/*.js', '**/*.jsx'],
      rules: {
        ...config.rules,
        'no-undef': 'off',
      },
    })),
  ...compat
    .config({
      env: {
        node: true,
        commonjs: true,
        es6: true,
      },
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'script',
      },
    })
    .map((config) => ({
      ...config,
      files: ['*mock-server.js', '*server.js'],
      rules: {
        ...config.rules,
        'no-undef': 'off',
        'no-console': 'off',
      },
    })),
  {
    ignores: [
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
      'node_modules/**/.eslintrc*',
    ],
  },
  {
    ignores: [
      'node_modules/',
      'node_modules/**/.eslintrc*',
      'node_modules/**/.eslintrc.js',
      'node_modules/**/.eslintrc.json ',
    ],
  },
];
