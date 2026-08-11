# Farewell Raffle — Spec

## 1. Overview

A small web app for a farewell event: coworkers register via a QR code over the next few days, and on the last day everyone gets called up one by one to spin a wheel that decides their prize. 6 t-shirts are guaranteed to be given out; everything else is a filler prize (snacks, drinks, etc.).

Three pages, one shared backend/data store:

1. **Registration page** — public, QR-code entry point, name only.
2. **Monitor page** — admin-only, view registrants, configure prizes, lock registration.
3. **Wheel page** — the big-screen view used live at the event.

## 2. Event Timeline

1. **Days before**: QR code posted at desk → people scan → land on registration page → type name → submit. No login, no validation, honor system.
2. **Anytime before the event**: you check the monitor page to see who's registered, adjust the prize list as headcount grows.
3. **Just before the draw**: you hit **Lock Registration** on the monitor page. This freezes the registrant list and finalizes the prize pool (see §5) so it's fixed for the live draw.
4. **During the event**: wheel page is put on a shared screen/projector. Each person picks their own name from a menu, presses (and holds) the spin button, wheel lands on their prize, then the next person picks their name and goes. Once someone has spun, their name is disabled in the menu so they can't spin again.
5. **After**: monitor page shows the full "who won what" table for reference.

## 3. Pages

### 3.1 Registration Page (`/register`)

- Single text field: **Name**.
- Submit button. No email, no auth — but **duplicate names are not allowed**: on submit, the name is checked (case-insensitive, trimmed) against existing registrants; if it matches, show an inline error (e.g. "That name's already registered — if this is you, you're all set!") and block the submit.
- Confirmation message after submit (e.g. "You're in! See you on the last day 🍻").
- Disabled/read-only state with a friendly message once registration is locked (e.g. "Registration is closed — see you tonight!").

### 3.2 Monitor Page (`/monitor`, admin only)

- **Access control**: gated behind a hardcoded password (single shared password, checked client- or server-side before the page loads — no user accounts needed for an event this size).
- **Registrant list**: live view of names + timestamp, in registration order. Duplicates are prevented at registration time (§3.1), so this list should always be unique names.
- **Manual edit controls**: delete a registrant entry (e.g. if someone registers by mistake or wants out).
- **Prize config**: a simple form on the page — add/edit/remove prize rows, each `{ name, quantity, isShirt }`. Starts pre-filled with `T-Shirt × 6`. You add filler prizes (Snack, Drink, Sticker, "High Five", whatever) with quantities directly through the form.
- **Lock/Unlock toggle**: locking registration (a) closes the registration page to new entries and (b) finalizes the prize pool to match the final headcount (§5). Unlocking is available in case you need to reopen before the event.
- **Reset button**: wipes all data — registrants, spin results, generated prize pool — and returns `EventState` to unlocked/empty, so you can run through the full flow end-to-end while testing before deployment. Requires a confirmation step (e.g. type "RESET" or a second confirm click) since it's destructive and irreversible. Should be clearly separated/styled apart from the other controls to avoid accidental clicks on the actual event night.
- **Results table**: live-updating list of everyone who has spun and what they won (name, prize, time), plus a running count of remaining unspun registrants and remaining prizes (including "shirts left: X"). This is the main view during the event if you're not standing at the wheel screen — updates in real time as people spin.

### 3.3 Wheel Page (`/wheel`, big-screen view)

- **Name picker**: a dropdown/menu listing all registrants. Anyone who has already spun is shown **disabled/greyed out** (and marked, e.g. "✓ Won: Snack") so they can't be selected again.
- Person selects their own name, then a wheel/spinner appears, segmented according to the **remaining** prize pool at that moment (so it visibly shrinks as t-shirts and fillers get claimed).
- **Hold-to-charge spin button**: holding builds up a visible "power" meter; releasing triggers the spin animation, with spin speed/duration scaled to how long it was held. (This is purely for feel — see §6 for how the actual outcome is decided.)
- On landing: confetti/highlight on the won prize, then the page resets to the name picker for the next person to select themselves.
- Progress indicator (e.g. "7 of 22 spun").
- End-of-session screen once everyone has spun, listing all winners.

## 4. Data Model

```
Registrant
  id
  name
  registeredAt
  order            // registration sequence, used as default draw order

PrizeConfig
  items: [{ name: string, quantity: int, isShirt: bool }]

SpinResult
  registrantId
  prizeName
  spunAt
  sequenceNumber

EventState
  registrationLocked: bool
  finalPrizePool: [prizeName]   // generated once, at lock time (see §5)
```

## 5. Prize Allocation Logic (guaranteeing all 6 shirts are given out)

This is the core fairness mechanic — a "drawing without replacement," like a raffle drum:

1. At **lock time**, the app knows the final registrant count `N`.
2. Build a pool of exactly `N` prize slots: 6 are `T-Shirt`; the remaining `N - 6` are filled from the configured filler prizes (repeating/proportionally trimming to fit). This pool is stored as an **unordered multiset** — no draw order is decided yet (see "Draw order" decision below).
   - If `N < 6`, flag this to you — not enough people to guarantee 6 winners; you'd decide manually (e.g. keep leftovers for later).
3. **Draw order is live**: nothing is pre-shuffled. At the moment each person spins, the server draws **uniformly at random from whatever's currently left in the pool**, removes that item, and assigns it to them. The wheel is built from *all remaining unclaimed prize types* at that moment, so segment sizes visibly shrink as the event goes on (e.g. once all 6 shirts are gone, the wheel has zero shirt segments left).
4. Because the pool has exactly one slot per person, everyone gets exactly one prize, and all 6 shirts are guaranteed distributed by the time the last person spins — regardless of what order people choose to step up and spin.

People pick their own name and spin in whatever order they line up at the wheel (§3.3), not a fixed call-up sequence — the live draw in step 3 already accounts for this. The "already spun" flag on a registrant is set server-side at the moment their spin resolves, so the same name can't be selected and spun twice even if someone clicks quickly or refreshes.

This keeps it feeling random and fair at every individual spin, while mathematically guaranteeing full shirt distribution — no risk of running out early or having shirts left over.

## 6. Spin Mechanic

- **Hold-to-charge** is a UX/animation layer only — longer hold = faster/longer spin animation, more suspense. It does **not** change the odds or the outcome.
- The actual prize awarded is decided **live**, server-side, at the moment of spin (§5): a uniform-random draw from whatever's currently left in the pool. Deciding it server-side (not client-side) means hold duration, timing, or refreshing the page can't be used to influence or predict the result — the outcome isn't determined until the spin actually happens, which also means nobody (including you) knows who'll get what in advance, adding to the suspense.

## 7. Tech Stack Options

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A. Vercel + Supabase (recommended)** | Frontend + API routes deployed on Vercel (free tier); Supabase (free tier) as the Postgres database, used for registrants, prize config, spin results, and event state | Both free at this scale; Supabase gives built-in **realtime subscriptions**, so the monitor page's results table and remaining-shirts count update live with no polling; Vercel handles hosting + serverless functions with no server to manage; reachable from any device over the internet for the whole multi-day registration window | Two accounts to set up (Vercel + Supabase); Supabase free projects pause after a week of inactivity — not a concern here since the whole registration window is only a few days |
| **B. Local-only** | Single Node/Express (or Python) app with a JSON file or SQLite as storage, run from your laptop; QR points to your laptop's local IP | Simplest to build, no external accounts, full privacy | Laptop must stay on and connected to the same network for the entire multi-day registration window — risky given it's "a few days" |
| **C. Static + serverless function** | Static frontend, one small serverless function per action, backed by a lightweight store (KV, or even a Google Sheet via Apps Script) | Middle ground — no server to keep running, still internet-accessible | A bit more moving parts than A, no built-in realtime |

**Decision**: Option A — Vercel (frontend/API) + Supabase (database). Free at this scale, and Supabase's realtime feature is a natural fit for the live monitor page and the wheel page's shrinking prize pool.

**Data model note**: the `Registrant`, `PrizeConfig`, `SpinResult`, and `EventState` tables in §4 map directly to Supabase (Postgres) tables. The monitor and wheel pages subscribe to `SpinResult` inserts and `Registrant`/`EventState` updates via Supabase realtime channels, so both views stay in sync automatically as spins happen.

## 8. Decisions Made

All previously open questions are now resolved:

| Question | Decision |
|---|---|
| Draw order | Live at spin time — no pre-shuffle, no fixed call-up order. Whoever steps up next picks their name and spins (§3.3, §5, §6). |
| Duplicate names | Not allowed. Registration blocks exact (case-insensitive, trimmed) name matches; monitor page can delete a registration if needed (§3.1, §3.2). |
| Prize config editing | Simple form on the monitor page — no config file (§3.2). |
| Access control (monitor page) | Hardcoded shared password gates the page (§3.2). |

No open decisions remain for v1 — ready to move to implementation. The wheel page itself is public/unlisted (no password), same as the registration page, since it's just a display + spin action at the live event.

## 9. Nice-to-Haves (stretch, not required for v1)

- Sound effects (tick as the wheel spins, drumroll, win chime).
- Confetti animation on shirt wins specifically.
- A "photo booth" moment: winner's name + prize shown full-screen for a photo before advancing.
- Exportable results list (CSV) at the end for your own keepsake.
