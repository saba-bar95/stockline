# Mise

Kitchen ops — stock, recipes, production, sales, overhead, P&L. Multi-tenant SaaS-style portfolio app: each signed-in kitchen only sees its own rows.

## Stack

- **Vite + React + TypeScript** — UI
- **Tailwind CSS v4** — kitchen teal theme
- **Clerk** — email + Google auth
- **Hono** — API (`/api`)
- **Drizzle + SQLite** — local DB (`data/mise.sqlite`)
- **Neon Postgres** — production DB (same logical schema in `server/db/schema.pg.ts`)

## Run locally (no Clerk keys)

```bash
npm install
npm run db:push
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:3001/api/health

Without `CLERK_SECRET_KEY` / `VITE_CLERK_PUBLISHABLE_KEY`, the API uses a local-dev organization and the UI skips sign-in. Good for offline work.

## Env vars

Copy `.env.example` → `.env` (API) and set Vite keys in `.env` / `.env.local`:

```
# Clerk (required in production)
CLERK_SECRET_KEY=
VITE_CLERK_PUBLISHABLE_KEY=

# Database — omit for local SQLite file; set Neon URL in production
DATABASE_URL=

# Signup gate
MAX_ORGS=25
REGISTRATION_OPEN=true

# CORS allowlist (comma-separated)
CORS_ORIGIN=http://localhost:5173,https://your-mise.vercel.app

PORT=3001
```

**Signup kill switch:** set `REGISTRATION_OPEN=false` or lower `MAX_ORGS` so first-login org creation returns 403. You can also disable public sign-ups in the Clerk Dashboard.

## Auth + tenancy

1. Browser signs in with Clerk (email or Google).
2. Frontend sends `Authorization: Bearer <JWT>` on every API call.
3. API verifies the JWT, looks up `memberships` for that Clerk `userId`, and scopes every query by `organizationId`.
4. First login creates an organization (unless the free tier is full).

Never trust a client-supplied org id.

## Exports

Signed-in kitchens can download **only their own data** from Settings:

- Excel workbook — `GET /api/export/workbook.xlsx`
- Per-entity CSV — `GET /api/export/csv/:entity` (e.g. `ingredients`, `pl`)

## Deploy (portfolio)

დეტალური ნაბიჯები: **[DEPLOY.md](./DEPLOY.md)** (Neon + Railway API + Vercel UI).

მოკლედ:

1. **Neon** — შექმენი პროექტი, დააკოპირე `DATABASE_URL`, გაუშვი `npm run db:push:neon`.
2. **Railway** — დეპლოი API (`npx tsx server/run.ts`), env: `CLERK_SECRET_KEY`, `DATABASE_URL`, `CORS_ORIGIN`.
3. **Vercel** — დეპლოი UI; `VITE_CLERK_PUBLISHABLE_KEY`; `vercel.json`-ში ჩაწერე Railway URL rewrite-ისთვის.
4. **Clerk** — დაამატე Vercel domain allowed origins / redirect URLs.

Local SQLite data is **not** auto-migrated to Neon.
## Domains

ინგრედიენტები · შესყიდული · პროდუქცია · რეცეპტები · შესყიდვები · წარმოება · გაყიდვები · ჩამოწერა · HR · ზედნადები · მოგება-ზარალი

## Excel sync (local only)

```bash
npm run excel:sync
```

Imports into the `dev_local_org` kitchen used by unauthenticated local mode.
