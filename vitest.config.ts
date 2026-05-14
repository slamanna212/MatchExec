import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@/shared': path.resolve(__dirname, './shared'),
      // @/lib/database lives in root lib/, not src/lib/ — match tsconfig fallback order
      '@/lib/database': path.resolve(__dirname, './lib/database'),
      '@/lib': path.resolve(__dirname, './src/lib'),
      '@': path.resolve(__dirname, './src'),
      '@lib': path.resolve(__dirname, './lib'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    reporters: ['default', 'github-actions'],
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx', 'lib/**/*.ts', 'processes/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/types.ts'],
    },
    setupFiles: ['./tests/vitest-mocks.ts', './tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,      // 60 seconds — CI machines can be slow with many parallel DB setups
    // Pool configuration for better test isolation
    pool: 'forks',
    // Limit parallelism in CI to avoid I/O contention from 70+ concurrent SQLite setups
    maxWorkers: process.env.CI ? 8 : undefined,
    // File parallelism to prevent database conflicts
    fileParallelism: true,
    isolate: true,
  },
});
