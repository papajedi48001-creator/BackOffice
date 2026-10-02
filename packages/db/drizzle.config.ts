import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'mysql',
  schema: './src/schema/*.ts',
  out: './migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'mysql://backoffice:local-development-only@127.0.0.1:3307/backoffice' }
});
