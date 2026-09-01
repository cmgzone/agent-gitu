import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'release/**', 'coverage/**', 'node_modules/**', '.hermes/**', '.freebuff/**', 'tests/agent-evals/results/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,js,cjs,mjs}'],
    rules: {
      // Baseline adoption: the existing codebase is typechecked strictly, but
      // has historical rule violations that are fixed incrementally. Keep the
      // all-source lint useful without blocking CI on unrelated cleanup.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      'no-undef': 'off',
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
      'prefer-const': 'off',
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-unsafe-finally': 'off',
      'no-empty': 'off',
      'no-regex-spaces': 'off',
    },
  },
  {
    // New and actively maintained modules use the stricter rule set now;
    // expand this list as legacy modules are cleaned up.
    files: [
      'src/agent/quality-metrics.ts',
      'src/cli/presenter.ts',
      'src/cli.ts',
      'src/context/change-signals.ts',
      'src/context/code-index.ts',
      'src/context/context-engine.ts',
      'src/evaluation/metrics.ts',
      'src/report/reporter.ts',
      'src/server/static-assets.ts',
      'scripts/eval-summary.ts',
      'tests/change-signals.test.ts',
      'tests/cli-presenter.test.ts',
      'tests/code-index.test.ts',
      'tests/context-engine.test.ts',
      'tests/evaluation-metrics.test.ts',
      'tests/quality-metrics.test.ts',
      'tests/static-assets.test.ts',
    ],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  prettier,
);
