import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*e2e.{test,spec}.?(c|m)[jt]s?(x)'],
  },
});
