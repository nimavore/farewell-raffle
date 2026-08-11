# Farewell Raffle 🍻🎡

A tiny web app for a farewell event: coworkers register via a QR code, then on
the last day each person picks their name and spins a wheel for a prize.
Six T-shirts are guaranteed to be given out; everything else is a filler prize
(or, if there are more people than prizes, a **"No prize"** — better luck next
time!).

- **`/register`** — public, name-only, blocks duplicate names.
- **`/monitor`** — password-gated admin: registrants, prize config, lock/unlock,
  live results, reset.
- **`/wheel`** — big-screen view for the live draw.

Built with Next.js (App Router) + Supabase (Postgres + Realtime). The prize
draw is decided **server-side, atomically, at the moment of each spin** — the
hold-to-charge meter is pure showmanship and can't influence the outcome.

## How the prize pool works

At **lock** time the app knows the final headcount `N` and builds a pool of
exactly `N` slots (one draw per person, drawn without replacement — like a
raffle drum):

- 6 × **T-Shirt** (guaranteed)
- your configured filler prizes at their **exact** quantities (fixed — not
  scaled)
- the remaining `N − 6 − Σ(fillers)` slots become **"No prize"**

Lock is refused (with a message) if `N < 6` (can't guarantee the shirts) or if
`6 + fillers > N` (more prizes than people — reduce filler quantities).

## Setup

### 1. Create a Supabase project

1. Sign up at [supabase.com](https://supabase.com) → **New project**.
2. In the project, open **SQL Editor** → paste the contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) →
   **Run**. This creates the tables, seed data, RLS policies, the RPC
   functions, and adds the tables to the realtime publication.
3. Open **Project Settings → API** and copy:
   - **Project URL**
   - **anon public** key
   - **service_role** key (keep this secret)

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
ADMIN_PASSWORD=<pick a shared password for /monitor>
```

> `SUPABASE_SERVICE_ROLE_KEY` and `ADMIN_PASSWORD` are server-only — they are
> never sent to the browser. Only the two `NEXT_PUBLIC_*` values are exposed.

### 3. Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Run of show

1. **Days before** — print a QR code pointing at `/register`. People scan and
   type their name.
2. **Anytime before** — open `/monitor`, watch registrations, add filler prizes
   (Snack ×3, Sticker ×1, …).
3. **Just before the draw** — hit **Lock Registration** on `/monitor`. This
   freezes the list and builds the prize pool.
4. **During** — put `/wheel` on the projector. Each person picks their name,
   holds to charge, releases to spin. Spun names grey out automatically.
5. **After** — `/monitor` (and the wheel's end screen) shows who won what.

Use **Reset** on the monitor page (type `RESET`) to wipe everything and
rehearse the full flow before the real night.

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. In [vercel.com](https://vercel.com) → **New Project** → import the repo.
3. Under **Environment Variables**, add the same four keys from `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`).
4. Deploy. Point your QR code at `https://<your-app>.vercel.app/register`.

## Notes

- The Supabase free tier pauses a project after ~a week of inactivity — fine for
  a multi-day event; just open the dashboard once if it's been idle.
- `/register` and `/wheel` are public (no password), same as the physical event.
  `/monitor` is gated by `ADMIN_PASSWORD`.
