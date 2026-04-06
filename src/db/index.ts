import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createHash, createCipher, createDecipher } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

// Resolve the plugin package root (where db/migrations/ lives)
const PLUGIN_ROOT = dirname(dirname(__dirname)); // dist/db/index.js → plugin root

// Database connection with team isolation
export function createDatabase(teamId: string) {
  const dbPath = process.env.KITCHEN_PLUGIN_DB_PATH
    || join(homedir(), '.openclaw', 'kitchen', 'plugins', 'marketing');
  if (!existsSync(dbPath)) mkdirSync(dbPath, { recursive: true });
  const teamDbFile = join(dbPath, `marketing-${teamId}.db`);
  
  const sqlite = new Database(teamDbFile);
  const db = drizzle(sqlite, { schema });
  
  return { db, sqlite };
}

// Encryption utilities for sensitive data
const ENCRYPTION_KEY = process.env.KITCHEN_ENCRYPTION_KEY || 'fallback-key-change-in-production';

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
  
  // Run migrations — resolve relative to the plugin package, not CWD
  try {
    const migrationsDir = join(PLUGIN_ROOT, 'db', 'migrations');
    migrate(db, { migrationsFolder: migrationsDir });
  } catch (error: any) {
    console.warn('Migration warning:', error?.message);
  }
  
  return { db, sqlite };
}

export type DatabaseConnection = ReturnType<typeof createDatabase>;