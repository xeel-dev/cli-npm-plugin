import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*e2e.{test,spec}.?(c|m)[jt]s?(x)'],
    // Windows runners are slow, so we need to increase the timeout
    testTimeout: process.platform === 'win32' ? 20_000 : 5_000,
  },
});
