# Mise — production deploy (Neon + Railway API + Vercel UI)

ეს არის **გზა 2**: Postgres Neon + ცალკე API ჰოსტი + Vercel frontend.
ლოკალური SQLite რჩება განვითარებისთვის (`DATABASE_URL` ცარიელი).

---

## არქიტექტურა

```
Browser  →  Vercel (https://mise-app-hazel.vercel.app)
                │  /api/*  rewrite (proxy)
                ▼
            Railway (https://mise-app-production-193e.up.railway.app)
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

GitHub repo: `saba-bar95/mza-app` (private OK).

---

## ნაბიჯი 1 — Neon Postgres

1. შედი https://console.neon.tech → **New Project** (რეგიონი ახლოს, მაგ. EU).
2. **Dashboard → Connection details** → დააკოპირე connection string  
   (`postgresql://...@...neon.tech/neondb?sslmode=require`).
3. ლოკალურად schema ატვირთე (ერთხელ):

```bash
cd ~/Desktop/mza-app
# .env-ში დროებით ჩაწერე Neon URL (ან მხოლოდ ამ ბრძანებისთვის):
DATABASE_URL="postgresql://USER:PASS@HOST/neondb?sslmode=require" npm run db:push:neon
```

წარმატებისას Neon-ში გამოჩნდება ცხრილები: `organizations`, `ingredients`, …

> ლოკალური Excel მონაცემები Neon-ში **ავტომატურად არ გადადის**. Production ცარიელი kitchen-ებით იწყება; მომხმარებლები Clerk-ით შედიან და საკუთარ org-ს ქმნიან.

---

## ნაბიჯი 2 — Railway (API)

1. https://railway.app → **New Project** → **Deploy from GitHub** → აირჩიე `mza-app`.
2. Settings / Variables — დაამატე:

```
CLERK_SECRET_KEY=sk_live_... ან sk_test_...
DATABASE_URL=postgresql://...neon.tech/...   # იგივე Neon URL
CORS_ORIGIN=https://YOUR_VERCEL_DOMAIN.vercel.app
MAX_ORGS=25
REGISTRATION_OPEN=true
PORT=3001
```

`VITE_*` Railway-ზე **არ** გჭირდება (ეს მხოლოდ frontend build-ისთვისაა).

3. Start command (თუ ავტომატურად არ აიღო `railway.toml`):

```
npx tsx server/run.ts
```

4. **Generate Domain** (Settings → Networking) — მიიღებ რაღაცას:  
   `https://mise-api-production-xxxx.up.railway.app`
5. შეამოწმე:  
   `https://YOUR_RAILWAY_HOST/api/health`  
   პასუხი უნდა იყოს `{"ok":true,"app":"mise"}`.

---

## ნაბიჯი 3 — Vercel (UI)

1. https://vercel.com → **Add New Project** → იმპორტი `mza-app`.
2. Framework: Other / Vite. Build: `npm run build`, Output: `dist`.
3. Environment Variables:

```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_... ან pk_live_...
```

4. რეპოში გახსენი `vercel.json` და შეცვალე placeholder:

```json
"destination": "https://YOUR_RAILWAY_HOST/api/:path*"
```

მაგალითი:

```json
"destination": "https://mise-api-production-xxxx.up.railway.app/api/:path*"
```

5. Deploy. მიიღებ: `https://mise-xxxxx.vercel.app`.

6. Railway-ზე განაახლე:

```
CORS_ORIGIN=https://mise-xxxxx.vercel.app
```

(თუ რამდენიმე origin გინდა: მძიმით გამოყავი.)

---

## ნაბიჯი 4 — Clerk production URLs

Clerk Dashboard → შენი აპლიკაცია:

1. **Paths / URLs**
   - Sign-in: `https://YOUR_VERCEL/ka/sign-in` (და `/en/sign-in` თუ გინდა)
   - Sign-up: `https://YOUR_VERCEL/ka/sign-up`
2. **Allowed origins / redirect URLs** — დაამატე Vercel დომენი.
3. Google OAuth ჩართული თუ გინდა სოციალური login.
4. Test keys (`pk_test` / `sk_test`) საკმარისია სტეიჯინგისთვის; პორტფოლიოსთვის ხშირად live keys გადაჰყავთ.

---

## ნაბიჯი 5 — შემოწმება

1. გახსენი Vercel URL → უნდა გამოჩნდეს sign-in.
2. დარეგისტრირდი / შეხედი → kitchen UI.
3. დაამატე ინგრედიენტი → Neon Table Editor-ში უნდა ჩანდეს `ingredients` row შენი `organization_id`-ით.
4. Settings → Excel/CSV export — უნდა მუშაობდეს (ორგანიზაციის მონაცემები მხოლოდ).

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
