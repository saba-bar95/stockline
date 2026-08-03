# MZA App

React + TypeScript port of the MZA restaurant Excel workbook (inventory, production, sales, overhead, P&L).

## Stack

- **Vite + React + TypeScript** — UI
- **Pico CSS** — minimal base + custom kitchen theme (Fraunces / Manrope)
- **Hono** — local API (`/api`)
- **Drizzle + SQLite** — database now (`data/mza.sqlite`)
- Later: same schema on **Neon Postgres** + deploy UI/API on **Vercel**

## Run locally

```bash
npm install
npm run dev
```

- Web: http://localhost:5173  
- API: http://localhost:3001/api/health  

## Domains (mirrors Excel sheets)

ინგრედიენტები · შესყიდული · პროდუქცია · რეცეპტები · შესყიდვები · წარმოება · გაყიდვები · ჩამოწერა · HR/ხელფასი · ზედნადები · მოგება-ზარალი

## Excel sync

```bash
npm run excel:sync
```

Reads `Desktop/mza (1).xlsm` → `scripts/export/*.json` → SQLite.

**Number parity:** source rows (purchases, production, sales…) are imported 1:1. Computed fields are **not always identical** to Excel yet — Excel’s product unit cost is a production-weighted average **plus overhead allocation**; the app currently shows live recipe × current ingredient averages (OH allocation exists in P&L/daily pool, not yet fully on every product row).

1. Create a Neon project  
2. Swap SQLite driver for `drizzle-orm/neon-http`  
3. Point `DATABASE_URL` at Neon  
4. Deploy API as Vercel serverless or keep a small Node host  

SQLite file is gitignored — each machine gets a fresh empty DB on first run.
