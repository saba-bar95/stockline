/**
 * Neon Postgres client for production.
 * Local/dev continues to use better-sqlite3 via `./index.ts`.
 *
 * Usage (when DATABASE_URL is postgres):
 *   import { createNeonDb } from './neon.ts'
 *   const db = createNeonDb(process.env.DATABASE_URL!)
 */
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema.pg.ts'

export function createNeonDb(databaseUrl: string) {
  const sql = neon(databaseUrl)
  return drizzle(sql, { schema })
}

export function isPostgresUrl(url: string | undefined): boolean {
  return Boolean(url?.startsWith('postgres://') || url?.startsWith('postgresql://'))
}
