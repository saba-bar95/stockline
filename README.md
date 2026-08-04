# Mise

Multi-tenant kitchen ops: stock, recipes, production, sales, overhead, and P&L — with Excel-style cost logic.

Each signed-in kitchen only sees its own data (`organizationId` scoping). Built as a portfolio SaaS-style app (Clerk auth, Neon in production).

**Live:** [mise-app-hazel.vercel.app](https://mise-app-hazel.vercel.app)

## Features

| Area | What it does |
|------|----------------|
| **Ingredients** | Stock, avg purchase cost, filters/sort/pagination, double-click movement history |
| **Resale** | Bought-for-resale products |
| **Products** | Manufactured items — ingredient + overhead unit cost (Excel parity) |
| **Recipes** | Per-unit ingredient lines |
| **Purchases / Production / Sales / Write-offs** | Day-to-day ops with stock checks |
| **HR / Payroll** | Employees and daily pay → daily overhead pool |
| **Overhead expenses** | Rent/utilities spread by month; other costs in daily pool |
| **P&L** | Day / week / month — revenue, COGS, write-offs, unallocated OH, net |
| **Settings** | Theme, font size, locale (KA/EN), org rename, CSV/Excel export |
| **Auth** | Email + Google via Clerk; custom sign-in/up UI |

## Stack

| Layer | Tech |
|-------|------|
| UI | Vite, React 19, TypeScript, Tailwind CSS v4 |
| Auth | Clerk (`@clerk/clerk-react` + `@clerk/backend`) |
| API | Hono on Node (`/api`) |
| Local DB | SQLite (`data/mise.sqlite`) via Drizzle + better-sqlite3 |
| Prod DB | Neon Postgres (`server/db/schema.pg.ts`) |
| Hosting | Vercel (UI) + Railway (API) + Neon |

## Architecture (production)

```
Browser  →  Vercel (static Vite app)
               │  /api/*  rewrite
               ▼
           Railway (Hono, `npm start`)
               │
               ▼
           Neon Postgres
```

Locally, Vite proxies `/api` → `http://localhost:3001`.

## Run locally

```bash
npm install
cp .env.example .env   # optional — fill Clerk keys for real auth
npm run dev
```

- Web: http://localhost:5173  
- API: http://localhost:3001/api/health  

**Do not rely on `npm run db:push` for local SQLite** — the API runs `migrate()` on startup.  
`db:push` can fail if indexes already exist; that is fine.

### Without Clerk keys

If `VITE_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` are empty:

- UI skips sign-in  
- API uses `dev_local_org`  

Good for offline UI/API work.

### With Clerk (recommended)

Put keys in `.env`, restart `npm run dev`, open `/ka/sign-in`.

## Environment variables

See `.env.example`. Important ones:

| Variable | Where | Purpose |
|----------|--------|---------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Local `.env` + **Vercel** | Clerk in the browser (baked at **build** time) |
| `CLERK_SECRET_KEY` | Local `.env` + **Railway** | JWT verify on API |
| `DATABASE_URL` | Local optional / **Railway** + Neon push | Empty → SQLite; `postgresql://…` → Neon |
| `CORS_ORIGIN` | **Railway** | e.g. `https://mise-app-hazel.vercel.app` |
| `MAX_ORGS` / `REGISTRATION_OPEN` | Railway | Cap / pause new kitchens |
| `PORT` | Railway | Default `3001` |

## Auth & tenancy

1. User signs in with Clerk (email code / password / Google).  
2. Frontend sends `Authorization: Bearer <JWT>` on API calls.  
3. API verifies the token, resolves `memberships` → `organizationId`.  
4. Every query is scoped to that org. First login can create an org (unless the free tier is full).

Never trust a client-supplied organization id.

## Cost model (Excel parity)

- Ingredient average cost from purchases  
- Production snapshots ingredient unit cost  
- Daily overhead pool = payroll + dated OH (excl. rent/utilities/salary mirrors) + (rent+utilities)/daysInMonth  
- Pool allocated to runs by ingredient-cost weight  
- Product full unit cost = weighted production ingredient + OH  

## Scripts

| Command | Use |
|---------|-----|
| `npm run dev` | Vite + API watch |
| `npm run build` | Typecheck + Vite production build |
| `npm start` | API only (Railway) |
| `npm test` | Vitest (org isolation, etc.) |
| `npm run db:push:neon` | Push Postgres schema to Neon (needs `DATABASE_URL` in `.env`) |
| `npm run excel:sync` | Import from local Excel into **SQLite** `dev_local_org` only |

## Deploy

Full walkthrough (Georgian): **[DEPLOY.md](./DEPLOY.md)**

Short version:

1. **Neon** — create DB → `npm run db:push:neon`  
2. **Railway** — deploy API (`npm start`), set `CLERK_SECRET_KEY`, `DATABASE_URL`, `CORS_ORIGIN`  
3. **Vercel** — deploy UI, set `VITE_CLERK_PUBLISHABLE_KEY`, rewrite `/api` → Railway in `vercel.json`  
4. **Clerk** — Paths: `/ka/sign-in`, `/ka/sign-up`, sign-out → `/ka/sign-in`  

After that, `git push` to `main` redeploys Vercel (UI) and usually Railway (API).

Local SQLite data is **not** migrated to Neon automatically.

## Project layout

```
src/           React UI (pages, auth, DataTable, i18n KA/EN, settings)
server/        Hono API, auth, export, cost logic
server/db/     SQLite + Neon Drizzle schemas, migrate, query helpers
scripts/       Excel export/import (local)
DEPLOY.md      Production deploy guide
vercel.json    UI build + /api rewrite to Railway
railway.toml   API start / healthcheck
```

## License

Private portfolio project.
