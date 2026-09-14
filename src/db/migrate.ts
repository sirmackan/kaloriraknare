// src/db/migrate.ts
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'path';
import fs from 'fs';

export async function runMigrations() {
  const migrationsFolder = path.join(process.cwd(), 'drizzle');
  if (!fs.existsSync(migrationsFolder)) {
    console.warn(`[db] Migrations folder not found at ${migrationsFolder}, skipping migrations.`);
    return;
  }

  const host = process.env.SQL_HOST;
  const database = process.env.SQL_DB_NAME;
  const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER;
  const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD;

  if (!host || !database || !user || !password) {
    console.warn('[db] Missing database environment variables, skipping migrations.');
    return;
  }

  const migrationPool = new Pool({
    host,
    user,
    password,
    database,
    max: 1,
    connectionTimeoutMillis: 10000,
  });

  try {
    console.log(`[db] Checking and applying pending migrations for ${database}...`);
    const migrationDb = drizzle(migrationPool);
    await migrate(migrationDb, { migrationsFolder });
    console.log('[db] Database migrations are up to date.');
  } catch (error) {
    console.error('[db] Migration run failed:', error);
    throw error;
  } finally {
    await migrationPool.end().catch((err) => {
      console.warn('[db] Failed to close migration pool cleanly:', err);
    });
  }
}
