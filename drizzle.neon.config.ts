import { defineConfig } from "drizzle-kit";

/** Neon Postgres production schema. Requires DATABASE_URL=postgresql://... */
export default defineConfig({
  schema: "./server/db/schema.pg.ts",
  out: "./drizzle-neon",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
