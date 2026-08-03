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

## Neon later

1. Create a Neon project  
2. Swap SQLite driver for `drizzle-orm/neon-http`  
3. Point `DATABASE_URL` at Neon  
4. Deploy API as Vercel serverless or keep a small Node host  

SQLite file is gitignored — each machine gets a fresh empty DB on first run.
