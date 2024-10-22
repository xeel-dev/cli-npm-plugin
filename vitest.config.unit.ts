import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*e2e.{test,spec}.?(c|m)[jt]s?(x)',
    ],
  },
});
