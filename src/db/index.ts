import * as schema from './schema';
import { createHash, createCipher, createDecipher } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

// Resolve the plugin package root (where db/migrations/ lives)
const PLUGIN_ROOT = dirname(dirname(__dirname)); // dist/db/index.js → plugin root

// Database connection with team isolation
export function createDatabase(teamId: string) {
  const dbPath = join(homedir(), '.openclaw', 'kitchen', 'plugins', 'marketing');
  if (!existsSync(dbPath)) mkdirSync(dbPath, { recursive: true });
  const teamDbFile = join(dbPath, `marketing-${teamId}.db`);

  // Lazy-load sqlite bindings so the plugin module can be discovered without
  // requiring the native dependency during top-level evaluation.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require('drizzle-orm/better-sqlite3');

  const sqlite = new Database(teamDbFile);
  const db = drizzle(sqlite, { schema });

  return { db, sqlite };
}

// Encryption utilities for sensitive data.
// Keep the legacy fallback key for compatibility with already-stored records,
// but do not read from process env anymore.
const ENCRYPTION_KEY = 'fallback-key-change-in-production';

export function encryptCredentials(credentials: object): Buffer {
  const plaintext = JSON.stringify(credentials);
  const hash = createHash('sha256').update(ENCRYPTION_KEY).digest();
  const cipher = createCipher('aes-256-cbc', hash);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return Buffer.from(encrypted, 'hex');
}

export function decryptCredentials(encryptedData: Buffer): object {
  const hash = createHash('sha256').update(ENCRYPTION_KEY).digest();
  const decipher = createDecipher('aes-256-cbc', hash);
  
  let decrypted = decipher.update(encryptedData.toString('hex'), 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return JSON.parse(decrypted);
}

// Database initialization
export function initializeDatabase(teamId: string) {
  const { db, sqlite } = createDatabase(teamId);

  // Run migrations, resolving relative to the plugin package, not CWD.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { migrate } = require('drizzle-orm/better-sqlite3/migrator');
  try {
    const migrationsDir = join(PLUGIN_ROOT, 'db', 'migrations');
    migrate(db, { migrationsFolder: migrationsDir });
  } catch (error: any) {
    // Fallback: run SQL directly if drizzle migrator fails (missing journal etc.)
    const migrationFiles = ['0001_initial.sql', '0002_generation_jobs.sql', '0003_post_platform_publishes.sql'];
    for (const migrationFile of migrationFiles) {
      try {
        const sqlPath = join(PLUGIN_ROOT, 'db', 'migrations', migrationFile);
        if (existsSync(sqlPath)) {
          const sql = require('fs').readFileSync(sqlPath, 'utf8');
          // Split on semicolons and run each statement
          const statements = sql.split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
          for (const stmt of statements) {
            try { sqlite.exec(stmt + ';'); } catch { /* ignore IF NOT EXISTS collisions */ }
          }
        }
      } catch { /* ignore individual migration failures */ }
    }
  }
  
  return { db, sqlite };
}

export type DatabaseConnection = ReturnType<typeof createDatabase>;