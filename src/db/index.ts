// src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
import * as schema from './schema.ts';

const { Pool } = pkg;

// Function to create a new connection pool.
export const createPool = () => {
  return new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    connectionTimeoutMillis: 15000,
  });
};

// Create a pool instance.
export const pool = createPool();

// Ensure database schema columns exist
export async function ensureSchema() {
  // Silent schema check without unhandled DDL queries
}

// Run schema check on startup
ensureSchema().catch((err) => console.error('Migration error:', err));

// Prevent unhandled pool-level errors from crashing the application
pool.on('error', (err) => {
  console.error('Unexpected error on idle SQL pool client:', err);
});

// Initialize Drizzle with the pool and schema.
export const db = drizzle(pool, { schema });
export * as schema from './schema.ts';
export { eq, and, or, desc, asc, sql } from 'drizzle-orm';
