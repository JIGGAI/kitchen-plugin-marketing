import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './db/migrations',
  driver: 'better-sqlite',
  dbCredentials: {
    url: './data/marketing.db', // Default database file
  },
  verbose: true,
  strict: true,
});