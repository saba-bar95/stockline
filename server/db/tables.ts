import "dotenv/config";
import * as pgSchema from "./schema.pg.ts";
import * as sqliteSchema from "./schema.ts";
import { isPostgresUrl } from "./neon.ts";

export const usingPg = isPostgresUrl(process.env.DATABASE_URL);

/**
 * Table objects must match the schema passed to the active Drizzle client.
 * Both schemas intentionally expose the same table and column names.
 */
export const s = (usingPg ? pgSchema : sqliteSchema) as typeof sqliteSchema;
