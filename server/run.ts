import "dotenv/config";
import { serve } from "@hono/node-server";
import { migratePostgres } from "./db/index.ts";
import { app } from "./index.ts";

const port = Number(process.env.PORT || 3001);
const dbMode = process.env.DATABASE_URL?.startsWith("postgres")
  ? "neon/postgres"
  : "sqlite";
await migratePostgres();
console.log(`Stockline API http://localhost:${port} (${dbMode})`);
serve({ fetch: app.fetch, port });
