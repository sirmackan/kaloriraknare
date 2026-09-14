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

  // In production deployments (Cloud Run), the application runs under restricted
  // database credentials (SQL_USER) which do not have DDL/CREATE SCHEMA permissions.
  // Schema updates are managed via Cloud SQL UpdateSchema.
  if (!process.env.SQL_ADMIN_USER) {
    console.log('[db] SQL_ADMIN_USER is not set. Skipping runtime migrations in production environment.');
    return;
  }

  const host = process.env.SQL_HOST;
  const database = process.env.SQL_DB_NAME;
  const user = process.env.SQL_ADMIN_USER;
  const password = process.env.SQL_ADMIN_PASSWORD;

  if (!host || !database || !user || !password) {
    console.warn('[db] Incomplete database admin credentials, skipping migrations.');
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
    console.warn('[db] Migration run encountered an issue (continuing startup):', error);
  } finally {
    await migrationPool.end().catch((err) => {
      console.warn('[db] Failed to close migration pool cleanly:', err);
    });
  }
}

