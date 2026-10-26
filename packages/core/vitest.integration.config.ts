import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Files share one database, and the master data import locks every organization and person row,
  // so fixtures in other files racing it deadlock at random. Concurrency is tested inside the files that mean to.
  test: { environment: 'node', globals: true, include: ['src/**/*.integration.test.ts'], fileParallelism: false }
});
