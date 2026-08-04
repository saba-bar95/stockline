import { defineConfig } from "drizzle-kit";

/** Local SQLite (default). For Neon: `drizzle-kit push --config drizzle.neon.config.ts` */
export default defineConfig({
  schema: "./server/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url:
      process.env.DATABASE_URL?.replace(/^file:/, "") || "./data/mise.sqlite",
  },
});
