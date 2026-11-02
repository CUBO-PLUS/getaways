# Gateways Referral Tracking MVP (CUBO+)

**Scope:** referral-code attribution for pending bookings, synchronization to confirmed/cancelled when the existing mock Bitcoin booking status changes, and an internal local report. No discount, partner rewards or public admin UI.

## Set up on a clean clone (Windows PowerShell)

Prerequisites: Node.js **24+**, pnpm **12**, Docker Desktop running. Run from `src/`:

```powershell
pnpm install
node scripts/referrals-setup.mjs
pnpm dev
```

The setup command is **repeatable** and does not delete bookings, database rows, migrations or blog content. It copies `.env.local.example` only if no `.env.local` exists, adds `NEXT_PUBLIC_SITE_URL=http://localhost:3000` only if absent, starts **only** the existing PostgreSQL Docker Compose service, emits the Prisma 8 contract, previews/applies the existing versioned migrations, verifies the database and creates an active development code `GETAWAYSDEMO` if absent. If that demo code already exists but is inactive, `seed` reactivates it.

**Blog/RustFS note:** Mauricio's new `compose.dev.yaml` requires S3/RustFS environment substitutions even for `docker compose ... up db`; the setup script supplies inert temporary placeholders for the Compose invocation only, starts just `db`, and does not edit the team's Compose settings. Running the separate blog admin and RustFS infrastructure may require additional configuration as described in the main README.

Setup requires a **local PostgreSQL URL** (`localhost` / `127.0.0.1`), refuses remote database targets, and does not run in `NODE_ENV=production`. It does not require the personal `ROGER10` record. `GETAWAYSDEMO` is a development-only demonstration code, not a promotional discount.

**Try the flow:** `http://localhost:3000/?ref=GETAWAYSDEMO` → choose a listing → reserve → reach checkout. See attribution with:

```powershell
node scripts/referrals-cli.mjs report
```

## Manage referral codes (development only)

```powershell
node scripts/referrals-cli.mjs seed
node scripts/referrals-cli.mjs create SURFCITY
node scripts/referrals-cli.mjs disable SURFCITY
node scripts/referrals-cli.mjs enable SURFCITY
node scripts/referrals-cli.mjs list
node scripts/referrals-cli.mjs report
```

These commands operate only against a **loopback PostgreSQL address**; there are **no unauthenticated management HTTP routes**. The server-only functions in `referral-management.ts` provide create, activate/deactivate, list and read-only counts for future authenticated administration. The CLI report excludes guest PII.

## Tests (PowerShell)

```powershell
pnpm exec tsc --noEmit -p .
pnpm test
$env:NODE_ENV = "development"
$env:PRISMA_TEST_DATABASE = "1"
pnpm exec vitest run modules/referrals/_test_
Remove-Item Env:PRISMA_TEST_DATABASE
pnpm db:check
```

Database tests generate unique temporary codes, clean up their own rows and do **not** use `ROGER10` or `GETAWAYSDEMO`. They mock the booking lookup for attribution unit/integration tests; they are not a substitute for the browser-to-payment demonstration. Never run them against a production DB.

## Flow and boundaries

1. `ReferralTracker` reads `?ref=CODE` and stores a normalized format-valid code in `sessionStorage` for the same browser tab.
2. `BookingWidget` includes `referral_code` when submitting to `/api/bookings`.
3. `/api/bookings` creates the existing JSON-backed pending booking, then calls `recordReferralForBooking()` best-effort. The active code is checked against PostgreSQL; at most one attribution is stored per booking ID.
4. **Only after** the mock Bitcoin route calls `markPaid()`, `syncReferralStatusForBooking` copies its `confirmed` or `cancelled` status to the existing PostgreSQL attribution. GET polling also repairs previously missed status synchronization; both paths catch referral errors without changing payment behavior.
5. `node scripts/referrals-cli.mjs report` returns total/pending/confirmed/cancelled counts by code.

No changes were made to the booking JSON store, pricing, Bitcoin provider or Prisma schema. The only modification to a shared payment-owned file is a small best-effort hook in `app/api/checkout/btc/route.ts`. Mauricio should review that hook before merge.

## Demo acceptance check

- Seed `GETAWAYSDEMO`; `list` confirms `active: true`.
- Reserve via `?ref=GETAWAYSDEMO`; `report` shows an extra pending referral.
- If available, complete a **development-only** mock BTC payment; `report` should show its status as `confirmed` (or `cancelled` if booking logic rejects it).
- Disable `GETAWAYSDEMO`, create another booking with it: booking should still proceed, but no new attribution should be created. Re-enable for the demo.
- Open an incognito window without a code; create a booking and confirm no referral is added.
- Test all commands on a clean local DB before asking Mauricio to deploy.

## Known limitations / future work

- **Important:** bookings persist in `.data/bookings.json`; referrals persist in PostgreSQL. `bookingId` is not a foreign key. Resetting JSON bookings while keeping Postgres can reuse IDs and attach stale attributions. Reset both deliberately only in a disposable test environment; production needs durable booking IDs or one database with a proper relation/transaction design.
- Setup may need manual intervention if the combined Prisma migration graph or a preexisting local DB has drift; do not reset the DB to force success. The repository's `migrations/app/refs/db.json` currently points to the earlier referral contract even though newer blog migrations exist. The setup previews/applies migrations and verifies the live schema, but does **not** edit migration history or refs.
- Only the existing mock BTC route synchronizes payment states; future real providers must call the same function from their authoritative confirmation flow.
- `sessionStorage` is scoped to one tab and can be blocked; no cross-device attribution or attribution expiration.
- The code model does not identify the promoter or implement a loyalty program. Define business rules with Gateways before extending the schema.
- This is an attribution **prototype** and not a production-ready referral/affiliate platform.
