import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import js from '@eslint/js';
import nx from '@nx/eslint-plugin';
import typescriptEslintEslintPlugin from '@typescript-eslint/eslint-plugin';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
  recommendedConfig: js.configs.recommended,
});

export default [
  ...nx.configs['flat/base'],
  { plugins: { '@typescript-eslint': typescriptEslintEslintPlugin } },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          // Preserve pre-ESLint-9 default; v9 changed caughtErrors from 'none' to 'all'
          caughtErrors: 'none',
        },
      ],
      // Newly enabled by typescript-eslint v8 recommended; not previously enforced
      '@typescript-eslint/no-empty-object-type': 'off',
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  ...compat
    .config({
      extends: [
        'plugin:@typescript-eslint/recommended',
        'plugin:prettier/recommended',
      ],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    })
    .map((config) => ({
      ...config,
      files: ['**/*.ts', '**/*.tsx'],
      rules: {
        ...config.rules,
        '@typescript-eslint/no-explicit-any': 'warn',
        // Newly enabled by typescript-eslint v8 recommended; not previously enforced
        '@typescript-eslint/no-empty-object-type': 'off',
      },
    })),
  ...compat
    .config({
      extends: ['eslint:recommended', 'plugin:prettier/recommended'],
    })
    .map((config) => ({
      ...config,
      files: ['**/*.js', '**/*.jsx'],
      rules: {
        ...config.rules,
        // Preserve pre-ESLint-9 default; v9 changed caughtErrors from 'none' to 'all'
        'no-unused-vars': ['error', { caughtErrors: 'none' }],
      },
    })),
  ...compat
    .config({
      env: {
        jest: true,
      },
    })
    .map((config) => ({
      ...config,
      files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.spec.js', '**/*.spec.jsx'],
      rules: {
        ...config.rules,
      },
    })),
];
