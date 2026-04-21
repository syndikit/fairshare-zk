import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/pages/api/**/*.ts'],
      exclude: ['**/*.test.ts'],
      thresholds: {
        statements: 95,
        branches: 80,
        functions: 95,
      },
    },
  },
});
