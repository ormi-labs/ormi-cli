import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import importX from 'eslint-plugin-import-x'
import nodePlugin from 'eslint-plugin-n'
import perfectionist from 'eslint-plugin-perfectionist'
import prettierRecommended from 'eslint-plugin-prettier/recommended'
import promise from 'eslint-plugin-promise'
import unicorn from 'eslint-plugin-unicorn'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  {
    ignores: [
      'node_modules',
      'dist',
      'build',
      'coverage',
      '**/.nx/**',
      '**/.svelte-kit/**',
      '**/snap/**',
      '**/vite.config.*.timestamp-*.*',
      '.output',
      'vite.config.ts',
    ],
  },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      nodePlugin.configs['flat/recommended'],
      importX.flatConfigs.recommended,
      importX.flatConfigs.typescript,
      stylistic.configs.customize({
        indent: 2,
        quotes: 'single',
        semi: false,
      }),
      promise.configs['flat/recommended'],
      perfectionist.configs['recommended-natural'],
      unicorn.configs['recommended'],
      prettierRecommended,
    ],
    files: ['src/**/*.{ts,tsx}', 'env.ts', 'vite.config.ts'],
    languageOptions: {
      globals: globals.builtin,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-invalid-void-type': 'off',
      '@typescript-eslint/only-throw-error': [
        'error',
        {
          allow: [
            {
              from: 'package',
              name: ['Redirect', 'NotFoundError'],
              package: '@tanstack/router-core',
            },
          ],
        },
      ],
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        { ignorePrimitives: { string: true } },
      ],
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'off',
      curly: ['error', 'all'],
      'import-x/no-dynamic-require': 'warn',
      'import-x/order': 'off',
      'perfectionist/sort-imports': [
        'error',
        {
          customGroups: [
            {
              elementNamePattern: ['^@oclif'],
              groupName: 'oclif',
              selector: 'type',
            },
            {
              elementNamePattern: ['^@oclif'],
              groupName: 'oclif',
            },
          ],
          environment: 'node',
          groups: [
            'oclif',
            ['value-builtin', 'value-external'],
            'type-internal',
            'value-internal',
            ['type-parent', 'type-sibling', 'type-index'],
            ['value-parent', 'value-sibling', 'value-index'],
            'ts-equals-import',
            'unknown',
          ],
        },
      ],
      'perfectionist/sort-objects': [
        'error',
        {
          order: 'asc',
          type: 'natural',
        },
      ],
      // graph-cli deep imports (dist/commands/*.js) exist on disk but the n plugin
      // can't resolve them via its ESM module resolver — TypeScript tsc catches real issues
      'n/no-missing-import': 'off',
      'promise/always-return': ['error', { ignoreLastCallback: true }],
    },
  },
)
