# Stockline — production deploy (Neon + Railway API + Vercel UI)

ეს არის **გზა 2**: Postgres Neon + ცალკე API ჰოსტი + Vercel frontend.
ლოკალური SQLite რჩება განვითარებისთვის (`DATABASE_URL` ცარიელი).

პროდუქტი: **Stockline** — მასალები, შემადგენლობა, წარმოება, გაყიდვები, ხელფასები, ხარჯები და მოგება-ზარალი.
განსაზღვრული დომენები (შემდეგ): `stockline.app`, `stockline.io`, `getstockline.com`.
GitHub: `saba-bar95/stockline`. Live UI: `https://stockline-app-zt12.vercel.app`.
Railway API: `https://stockline-production-ab98.up.railway.app` (see `vercel.json`).

---

## არქიტექტურა

```
Browser  →  Vercel (https://stockline-app-zt12.vercel.app)
                │  /api/*  rewrite (proxy)
                ▼
            Railway (https://stockline-production-ab98.up.railway.app)
                │
                ▼
            Neon Postgres
```

Clerk ამოწმებს მომხმარებელს ბრაუზერში; API იღებს `Authorization: Bearer <JWT>`.

---

## ნაბიჯი 0 — რა გჭირდება

| სერვისი | რისთვის | უფასო ტიერი |
|---------|---------|-------------|
| [Neon](https://neon.tech) | Postgres DB | კი |
| [Railway](https://railway.app) ან Render | Node API | კი (ლიმიტებით) |
| [Vercel](https://vercel.com) | Frontend | კი |
| [Clerk](https://dashboard.clerk.com) | Auth (უკვე გაქვს) | კი |

GitHub repo: `saba-bar95/stockline` (private OK).

---

## ნაბიჯი 1 — Neon Postgres

1. შედი https://console.neon.tech → **New Project** (რეგიონი ახლოს, მაგ. EU).
2. **Dashboard → Connection details** → დააკოპირე connection string  
   (`postgresql://...@...neon.tech/neondb?sslmode=require`).
3. ლოკალურად schema ატვირთე (ერთხელ):

```bash
cd ~/Desktop/stockline
# .env-ში დროებით ჩაწერე Neon URL (ან მხოლოდ ამ ბრძანებისთვის):
DATABASE_URL="postgresql://USER:PASS@HOST/neondb?sslmode=require" npm run db:push:neon
```

წარმატებისას Neon-ში გამოჩნდება ცხრილები: `organizations`, `ingredients`, `employees` (`position` სვეტით) …

> ლოკალური Excel მონაცემები Neon-ში **ავტომატურად არ გადადის**. Production ცარიელი ორგანიზაციებით იწყება; მომხმარებლები Clerk-ით შედიან და საკუთარ org-ს ქმნიან.

სქემის შემდეგი ცვლილების შემდეგ (მაგ. ახალი სვეტი) ისევ გაუშვი `db:push:neon`. API სტარტზე Neon-ზე ასევე იძახებს `ensurePostgresColumns` (`employees.position`) — თუ ცხრილი ჯერ არ არსებობს, ეს ALTER უვნებელია.

---

## ნაბიჯი 2 — Railway (API)

1. https://railway.app → **New Project** → **Deploy from GitHub** → აირჩიე `stockline`.
2. Settings / Variables — დაამატე:

```
CLERK_SECRET_KEY=sk_live_... ან sk_test_...
DATABASE_URL=postgresql://...neon.tech/...   # იგივე Neon URL
CORS_ORIGIN=https://stockline-app-zt12.vercel.app
MAX_ORGS=25
REGISTRATION_OPEN=true
PORT=3001
```

`VITE_*` Railway-ზე **არ** გჭირდება (ეს მხოლოდ frontend build-ისთვისაა).

`CLERK_SECRET_KEY` **აუცილებელია**. თუ აკლია, API Neon/production-ზე არ იხსნება ლოკალური org-ით — პასუხი იქნება 503 `misconfigured`.

3. Start command (თუ ავტომატურად არ აიღო `railway.toml`):

```
npx tsx server/run.ts
```

4. **Generate Domain** (Settings → Networking) — მიიღებ რაღაცას:  
   `https://stockline-production-ab98.up.railway.app` (ან ახალი სახელი თუ გადაარქვი)
5. შეამოწმე:  
   `https://YOUR_RAILWAY_HOST/api/health`  
   პასუხი უნდა იყოს `{"ok":true,"app":"stockline"}`.

---

## ნაბიჯი 3 — Vercel (UI)

1. https://vercel.com → **Add New Project** → იმპორტი `stockline`.
2. Framework: Other / Vite. Build: `npm run build`, Output: `dist`.
3. Environment Variables:

```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_... ან pk_live_...
```

4. რეპოში გახსენი `vercel.json` და შეცვალე placeholder:

```json
"destination": "https://YOUR_RAILWAY_HOST/api/:path*"
```

მაგალითი (მიმდინარე):

```json
"destination": "https://stockline-production-ab98.up.railway.app/api/:path*"
```

5. Deploy. მიმდინარე UI: `https://stockline-app-zt12.vercel.app`.

6. Railway-ზე განაახლე:

```
CORS_ORIGIN=https://stockline-app-zt12.vercel.app
```

(თუ რამდენიმე origin გინდა: მძიმით გამოყავი.)

---

## ნაბიჯი 4 — Clerk production URLs

Clerk Dashboard → შენი აპლიკაცია:

1. **Paths / URLs**
   - Sign-in: `https://stockline-app-zt12.vercel.app/ka/sign-in` (და `/en/sign-in` თუ გინდა)
   - Sign-up: `https://stockline-app-zt12.vercel.app/ka/sign-up`
2. **Allowed origins / redirect URLs** — დაამატე Vercel დომენი (თუ Dashboard-ში გაქვს ასეთი ველი).
3. Google OAuth ჩართული თუ გინდა სოციალური login.
4. Test keys (`pk_test` / `sk_test`) საკმარისია სტეიჯინგისთვის; პორტფოლიოსთვის ხშირად live keys გადაჰყავთ.

---

## ნაბიჯი 5 — შემოწმება

1. გახსენი Vercel URL → უნდა გამოჩნდეს sign-in.
2. დარეგისტრირდი / შეხედი → Stockline UI.
3. დაამატე ინგრედიენტი → Neon Table Editor-ში უნდა ჩანდეს `ingredients` row შენი `organization_id`-ით.
4. Settings → Excel/CSV export — უნდა მუშაობდეს (ორგანიზაციის მონაცემები მხოლოდ).
5. Sidebar → **How it works** — overlay იხსნება იმავე viewport-ზე (ცალკე გვერდი არ არის).

---

## ლოკალური vs production

| | Local | Production |
|--|-------|------------|
| DB | SQLite `data/mise.sqlite` | Neon Postgres |
| API | `npm run dev` → `:3001` | Railway |
| UI | Vite `:5173` + proxy `/api` | Vercel + rewrite `/api` |
| Auth | Clerk keys in `.env` | იგივე/live keys ჰოსტებზე |

ლოკალურად Neon-ის გამოსაცდელად `.env`-ში ჩაწერე `DATABASE_URL=postgresql://...` და გადატვირთე API — ლოგში უნდა ეწეროს `(neon/postgres)`.

---

## ხშირი პრობლემები

**`/api` 404 ან CORS error**  
- `vercel.json` rewrite URL არასწორია ან არ დაადეპლოე ხელახლა.  
- Railway `CORS_ORIGIN` არ ემთხვევა Vercel დომენს (თუ პირდაპირ API-ს იძახებ).

**Sign-in მუშაობს, მონაცემები არ ინახება**  
- Railway-ზე `DATABASE_URL` აკლია ან `db:push:neon` არ გაგიკეთებია.

**API 503 `misconfigured`**  
- Railway-ზე `CLERK_SECRET_KEY` აკლია. Production-ში Clerk-ის გარეშე API აღარ იხსნება.

**ხელფასი/თანამშრომელი: `position` ან PATCH ვერ ინახება**  
- Neon schema ძველია. თავიდან გაუშვი `db:push:neon` და გადატვირთე Railway API.

**Clerk: redirect mismatch**  
- Dashboard-ში დაამატე ზუსტი Vercel URL.

**`db:push` SQLite index error**  
- ლოკალურად `db:push` არ გჭირდება — `migrate()` საკმარისია. Neon-ისთვის მხოლოდ `db:push:neon`.

---

## Signup გათიშვა (როცა ადგილები შეივსება)

Railway env:

```
REGISTRATION_OPEN=false
```

ან შეამცირე `MAX_ORGS`. Clerk-ში ასევე შეგიძლია public sign-ups გამორთო.
