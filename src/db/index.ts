// src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

// Add global connection pool caching to persist across hot-reloads
declare global {
  var _postgresPool: Pool | undefined;
  var _drizzleInstance: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

function requiredEnvironmentVariable(name: 'SQL_HOST' | 'SQL_USER' | 'SQL_PASSWORD' | 'SQL_DB_NAME') {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

// Function to create or retrieve the connection pool.
export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: requiredEnvironmentVariable('SQL_HOST'),
      user: requiredEnvironmentVariable('SQL_USER'),
      password: requiredEnvironmentVariable('SQL_PASSWORD'),
      database: requiredEnvironmentVariable('SQL_DB_NAME'),
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    // Prevent unhandled pool-level errors from crashing the application
    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });

    // Ensure pg_trgm extension and configure word_similarity threshold for typo-tolerant matching
    global._postgresPool.on('connect', (client) => {
      void client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm; SET pg_trgm.word_similarity_threshold = 0.3;').catch((error) => {
        console.error('Failed to initialize pg_trgm extension or threshold:', error);
      });
    });
  }
  return global._postgresPool;
};

// Create or retrieve the pool instance.
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const realPool = createPool();
    const val = (realPool as any)[prop];
    return typeof val === 'function' ? val.bind(realPool) : val;
  },
});

let customDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function setDb(override: any) {
  customDb = override;
}

// Initialize Drizzle with the pool and schema.
export const db: ReturnType<typeof drizzle<typeof schema>> = new Proxy({} as any, {
  get(_target, prop) {
    if (customDb) {
      const val = (customDb as any)[prop];
      return typeof val === 'function' ? val.bind(customDb) : val;
    }
    if (!global._drizzleInstance) {
      global._drizzleInstance = drizzle(createPool(), { schema });
    }
    const val = (global._drizzleInstance as any)[prop];
    return typeof val === 'function' ? val.bind(global._drizzleInstance) : val;
  },
});
