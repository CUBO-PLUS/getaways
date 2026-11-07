# Gateways Referral Tracking MVP (CUBO+)

**Scope:** referral-code attribution for pending bookings, synchronization to confirmed/cancelled after authoritative booking payment transitions, and an internal local report. No discount, partner rewards or public admin UI.

**Payment update — 2026-11-07:** the placeholder provider and simulated-payment
action are retired. BTCPay Testnet settlement is authoritative, with USD 1.00 for
new attempts and an unchanged stay quote. Payment reconciliation retains referral
recovery; GET status reads never reconcile payments. Mock-payment walkthroughs
below describe the historical assignment, not the current checkout.

## Set up on a clean clone (Windows PowerShell)

Prerequisites: Node.js **24+**, pnpm **12**, Docker Desktop running. Run from `src/`:

```powershell
pnpm install
node scripts/referrals-setup.mjs
pnpm dev
```

The setup command is **repeatable** and does not delete bookings, database rows, migrations or blog content. It copies `.env.example` only if no `.env` exists, adds `NEXT_PUBLIC_SITE_URL=http://localhost:3000` only if absent, starts **only** the existing PostgreSQL Docker Compose service, emits the Prisma 8 contract, previews/applies the existing versioned migrations, verifies the database and creates an active development code `GETAWAYSDEMO` if absent. If that demo code already exists but is inactive, `seed` reactivates it.

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

1. `ReferralTracker` reads `?ref=CODE`, normalizes its format and stores it in `sessionStorage` for the current browser tab.
2. `BookingWidget` includes `referral_code` when submitting to `/api/bookings`.
3. An authenticated guest account is required. The API creates the pending booking in PostgreSQL and attempts to record the referral.
4. The server validates the active code and prevents multiple attributions for the same booking. Referral recording failures do not cancel the booking.
5. Authoritative booking/payment transitions synchronize the referral status. GET requests do not confirm or reconcile payments.
6. `node scripts/referrals-cli.mjs report` displays total, pending, confirmed and cancelled counts by code.

Bookings and referral attribution persist in PostgreSQL. The current payment flow uses BTCPay Testnet; simulated-payment walkthroughs are obsolete.

## Demo acceptance check

These are verification steps, not a claim that a new demonstration has been executed.

- Prepare the local services and catalogue using the technical documentation.
- Seed `GETAWAYSDEMO` and confirm that the code is active.
- Open `http://localhost:3000/?ref=GETAWAYSDEMO`, sign in to a guest account and create a valid booking.
- Check that the report contains the pending attribution.
- If completing the authorized payment demonstration, use Bitcoin Testnet 4 and the documented BTCPay verification/reconciliation flow. The USD 1.00 test charge is separate from the stay quote.
- Confirm the resulting booking and referral status.
- Disable the code and check that a new booking does not receive an attribution for that inactive code.
- Repeat without a referral code and check that no attribution is created.

## Known limitations / future work

- This is an attribution prototype.
- `sessionStorage` is limited to one browser tab and may be unavailable.
- Cross-device attribution and an attribution-expiration policy are not implemented.
- Referral codes do not implement promoter identity, rewards or a loyalty program.
- Incentives, eligibility, limits and cancellation rules require business approval.
- Payment webhook automation and other operational exceptions remain subject to the payment documentation.
- Database migration differences must be reviewed against the actual environment before applying changes.
