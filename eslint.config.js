const js = require('@eslint/js');
const typescript = require('@typescript-eslint/eslint-plugin');
const typescriptParser = require('@typescript-eslint/parser');
const prettier = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  // Base configuration
  js.configs.recommended,
  
  // Global ignores
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '*.js',
      '*.d.ts',
      'src/generated/**',
      'src/graphql/types.ts',
      'src/prisma/generated-client/**',
      'prisma-test/**',
      'jest.config.ts',
      'jest.setup.ts',
      'jest.global-setup.ts',
      'jest.global-teardown.ts'
    ]
  },
  
  // TypeScript files configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json'
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'writable',
        module: 'writable',
        require: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Promise: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': typescript,
      prettier: prettier
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-explicit-any': 'off', // Allow any - generated code uses it
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      
      // General rules
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }], // Allow console.log in generated code
      'no-unused-vars': 'off', // Use TypeScript's no-unused-vars instead
      'no-undef': 'off', // TypeScript handles this
      'no-redeclare': 'off', // Allow redeclare - happens in generated code
      
      // Prettier - warn instead of error to avoid CI failures
      'prettier/prettier': ['warn', {
        semi: false,
        singleQuote: true,
        trailingComma: 'all'
      }]
    }
  },
  
  // Test files configuration
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly'
      }
    }
  }
];
