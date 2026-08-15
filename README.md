# Stockline

Multi-tenant production ops for companies that make products from materials: stock, compositions, production, sales, payroll, expenses, and P&L — with Excel-style unit-cost logic.

Built for **operations managers, accountants, directors, and owners** who need materials → compositions → production → sales to stay consistent.

Each signed-in organization only sees its own data (`organizationId` scoping). Auth via Clerk; Neon Postgres in production.

**Live:** [stockline-app-zt12.vercel.app](https://stockline-app-zt12.vercel.app/)

**Intended domains** (buy / wire later): `stockline.app`, `stockline.io`, `getstockline.com`

## Features

| Area | What it does |
|------|----------------|
| **Materials** | Stock, avg purchase cost, filters/sort/pagination, movement history |
| **Merchandise** | Bought-for-resale products |
| **Products** | Manufactured items — material + overhead unit cost (Excel parity) |
| **Compositions** | Per-unit material lines (bill of materials) |
| **Purchases / Production / Sales / Write-offs** | Day-to-day ops with stock and date checks |
| **Payroll** | Employees (name, position, daily rate, active/inactive) and payroll rows. The rate is a reminder only — a payroll entry posts wages. Inactive people stay in history but cannot be added to new payroll. Edit/delete a payroll row and that day’s overhead + production cost recalculate. |
| **Expenses** | Rent/utilities spread by month; other costs in the daily pool. Wages belong on Payroll, not here. |
| **P&L** | Day / week / this month / last month — revenue, COGS, write-offs, unallocated OH, net |
| **How it works** | In-app overlay (sidebar or mobile header) — pages, edits, cost allocation, P&L |
| **Settings** | Theme, font size, locale (KA/EN), quantity decimals, org rename, CSV/Excel export |
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
| `CORS_ORIGIN` | **Railway** | e.g. `https://stockline-app-zt12.vercel.app` |
| `MAX_ORGS` / `REGISTRATION_OPEN` | Railway | Cap / pause new organizations |
| `PORT` | Railway | Default `3001` |

## Auth & tenancy

1. User signs in with Clerk (email code / password / Google).  
2. Frontend sends `Authorization: Bearer <JWT>` on API calls.  
3. API verifies the token, resolves `memberships` → `organizationId`.  
4. Every query is scoped to that org. First login can create an org (unless the free tier is full).

Never trust a client-supplied organization id.

## Security

- **Auth:** Clerk JWT on every `/api` route except `/api/health`. Production and Neon **require** `CLERK_SECRET_KEY` — missing keys do not open a local org.
- **Tenancy:** memberships map a Clerk user to one organization; queries are scoped with `organizationId`. IDs from another org return 404.
- **Browser:** tokens go in `Authorization: Bearer`, not cookies (no classic CSRF). Vercel sends frame-deny, nosniff, and a CSP that allows Clerk + Google sign-in.
- **Abuse:** per-IP rate limits (stricter on writes/export), 256 KB body cap, 45s request timeout. Tenant JSON is `Cache-Control: no-store`.

This is a small multi-tenant ops app, not a bank. Keep Clerk, Neon, and Railway secrets out of git; set `CORS_ORIGIN` to the real Vercel URL; use Clerk live keys when you leave test mode.

## Cost model

- **Material average cost** = sum of purchase totals ÷ sum of purchase quantities (that material).
- **Production** snapshots **material** unit cost at save time. Later purchase-price changes do not rewrite that run’s material total.
- **Daily overhead pool** = payroll on that date + other expenses on that date + (rent + utilities in that calendar month) ÷ days in the month. Overhead is **not** snapshotted — it always uses the current pool for the run’s date.
- **Allocation:** if you produce that day, the pool is baked into those runs (split by each run’s material-cost weight; if material cost is zero, split by quantity so wages are not dropped). Unsold allocated OH stays in **inventory** (stock value), not in net profit.
- **No production that day:** the same pool hits net as **unallocated overhead**. It is not carried forward.
- **Product full unit cost** = live average of (material + overhead) across all of that product’s runs. Sold and written-off units use this average, so editing past payroll/expenses on a production day updates COGS.
- **Merchandise** never receives production overhead (average purchase price only).
- **P&L:** `net = revenue − COGS − write-off cost − unallocated`. Allocated overhead is already inside manufactured COGS for units you sold — do not subtract the full overhead line again.

In the app, **How it works** (sidebar) spells this out with the page map and edit rules.  

## Scripts

| Command | Use |
|---------|-----|
| `npm run dev` | Vite + API watch |
| `npm run build` | Typecheck + Vite production build |
| `npm start` | API only (Railway) |
| `npm test` | Vitest: org isolation, P&L/overhead, mutations, payroll ↔ production flow |
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
src/           React UI (pages, auth, DataTable, i18n KA/EN, settings, how-it-works overlay)
server/        Hono API, auth, export, cost logic
server/db/     SQLite + Neon Drizzle schemas, migrate, query helpers
server/tests/  Vitest (isolation, P&L, mutations, payroll)
scripts/       Excel export/import (local SQLite `dev_local_org` only)
DEPLOY.md      Production deploy guide
vercel.json    UI build + /api rewrite to Railway
railway.toml   API start / healthcheck
```

## License

Private portfolio project.
