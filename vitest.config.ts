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
    fileParallelism: false,
    testTimeout: 15000,
    
  },
});
