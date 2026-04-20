import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../util/config.js';
import { logger } from '../util/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type DB = Database.Database;

let instance: DB | null = null;

export function getDb(): DB {
  if (instance) return instance;

  const dbPath = path.resolve(process.cwd(), config.dbPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  instance = new Database(dbPath);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');

  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  instance.exec(schema);

  logger.info({ dbPath }, 'SQLite initialized');
  return instance;
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
