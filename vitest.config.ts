import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Freebuff worktrees are independent repositories that can sit beneath
    // this workspace. They must not be collected as this project's tests.
    exclude: ['**/node_modules/**', '**/dist/**', '**/release/**', '**/.freebuff/**'],
    setupFiles: ['./tests/setup.ts'],
    // Git/execFileSync-heavy tests starve under parallel forks on AV-scanned
    // Windows machines; run files sequentially so they stay fast and stable.
    fileParallelism: false,
    testTimeout: 15000,
    
  },
});
