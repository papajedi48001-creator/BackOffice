import { defineConfig } from 'vitest/config';

export default defineConfig({
  // With DATABASE_URL set (as in CI) this run includes the integration files, which must not race each other; see vitest.integration.config.ts.
  test: { environment: 'node', globals: true, fileParallelism: false }
});
