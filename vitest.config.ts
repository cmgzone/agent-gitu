import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Nested agent worktrees are independent repositories. Collecting them
    // duplicates whole test suites, slows validation dramatically, and can
    // run stale copies of a test instead of the file being edited here.
    exclude: ['**/node_modules/**', '**/dist/**', '**/release/**', '**/.freebuff/**', '**/.hermes/worktrees/**'],
    setupFiles: ['./tests/setup.ts'],
    // Git/execFileSync-heavy tests starve under parallel forks on AV-scanned
    // Windows machines; run files sequentially so they stay fast and stable.
    // A single fork can also finish every test but leave its coordinator
    // waiting on a dead child process. Keep the same sequential execution in
    // one test thread so `npm test` exits reliably.
    pool: 'threads',
    poolOptions: {
      threads: { singleThread: true },
    },
    fileParallelism: false,
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/server/ui.ts'], // static browser template is exercised by server tests but has no executable branches
      thresholds: {
        lines: 60,
        functions: 60,
        statements: 60,
        branches: 55,
      },
    },
  },
});
