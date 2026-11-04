# Getaways El Salvador: student repo (mock Bitcoin checkout)

This is the public website of Getaways El Salvador, a vacation-rental business, prepared as a class project. The site, the property pages, the photos and the blog run locally. The booking flow runs up to the payment step. The payment step is a **starter stub**: your job is to build the mock Bitcoin payment. See [TASK.md](./TASK.md).

Resumen en español: este repositorio es la versión pública de la web de Getaways El Salvador. Todo corre en local, sin claves ni cuentas. El pago con Bitcoin es un "stub" que ustedes deben completar. Las instrucciones completas están en [TASK.md](./TASK.md) (sección en español al final).

## Requirements

- Node.js 24 or newer
- pnpm 12

PostgreSQL and private RustFS/S3 are required for the blog and property catalogue.
Static editorial pages and site artwork still use local JSON/files.

## Run it

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

### Prisma 8 and the local development database

From this directory, with Docker running:

```bash
cp .env.example .env  # only if .env does not exist; configure its credentials
docker compose -f compose.dev.yaml up -d --wait db
pnpm db:generate
pnpm db:check
pnpm test:db
```

The application and Prisma CLI use the same `DATABASE_URL` from `.env`, with `127.0.0.1` and the published port for the host. Inside Compose, `DATABASE_COMPOSE_HOST=db` translates a loopback URL to `db:5432`; remote URLs are unchanged. PostgreSQL itself still needs `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` for initialization; keep them consistent with the URL. Changing these values does not change an existing database volume or its credentials. Keep `.env` private and never commit it. Do not keep an overriding `DATABASE_URL` in `.env.local`.

### Local RustFS for blog media

Copy `.env.example` to `.env` and replace both RustFS root and application credential placeholders with unique random values. The root identity is only for the local RustFS service/one-shot bucket initializer; never put it in the app's S3 variables. `S3_BUCKET` defaults to `blog-media`; if changed, update **both** bucket ARNs in `infrastructure/storage/blog-media-policy.json` to match before provisioning the application identity. Then use the RustFS console at `http://127.0.0.1:9001` to create a user with that policy (it grants only list/location and object read/write/delete in the configured bucket). Put that user's credentials in `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` in `.env`. Do not expose these variables with a `NEXT_PUBLIC_` prefix.

```bash
docker compose -f compose.dev.yaml up -d --wait
```

Compose binds the S3 API and console to loopback; the app container uses `http://rustfs:9000`, while a process running on the host uses `http://127.0.0.1:9000`. `rustfs-init` idempotently creates the private `blog-media` bucket. No anonymous/public-read policy is applied. RustFS persists data in the `rustfs_data` volume; a volume is not a backup. Back up PostgreSQL and RustFS objects together and test restoring both. Production endpoint, TLS, private networking, credentials, and backup schedule must be configured by the operator; they are not verifiable from this repository.

The contract is `infrastructure/prisma/contract.prisma`; the server-only client is exported as `db` from `@/infrastructure/prisma/db`. Prisma 8 uses `@prisma/orm-postgres`, not `@prisma/client`. Commit the emitted `contract.json` and `contract.d.ts` alongside the contract. Blog, staff accounts and the catalogue use PostgreSQL; booking storage has not yet been migrated.

The catalogue migration CLI is `pnpm listings:import` (read-only inventory),
`pnpm listings:import --apply` (explicit import) and `pnpm listings:import --verify`
(read-only source/database/S3 comparison). Back up the database and objects and
stop application writers before applying. Existing differences abort instead of
overwriting edits. See [plan 2 and local evidence](docs/plans/catalogo-y-medios/README.md).

After editing the contract, emit it and plan a versioned migration from the actual database marker; review and rehearse it on an isolated copy before applying. Do not run `db:init` against an existing database. The development client cache is invalidated when the contract or connection URL changes.

`pnpm test:db` checks a real SQL query and client reuse across module reloads. The normal test suite skips this check so it does not require PostgreSQL.

### Operator account provisioning

After the reviewed users migration has been applied, run `docker exec -it gateways-dev-app-1 pnpm admin:user bootstrap` in an interactive terminal for the local Docker environment. Outside Docker, `pnpm admin:user bootstrap` requires `DATABASE_URL` to be configured. Bootstrap only succeeds when the user table is empty. For operational recovery, use `docker exec -it gateways-dev-app-1 pnpm admin:user recover`; it asks for an existing account email, explicit confirmation and a new password, then activates it as ADMIN and revokes its sessions. Restrict server and database access: recovery bypasses web authentication. Password entry is hidden; never put passwords in arguments, environment variables or shell history. Deliver credentials separately over a secure channel. Passwords do not expire automatically.

Login and reauthentication use PostgreSQL rate limits. Without a trusted proxy, all clients share the same global budget; enable `AUTH_TRUST_PROXY=1` only behind a non-bypassable proxy that overwrites `X-Real-IP`.

Other useful commands:

```bash
npx tsc --noEmit -p .   # type check
npx vitest run          # tests
npx next build          # production build
```

## Project map

| Where | What lives there |
| --- | --- |
| `app/(site)/` | Public pages: home, properties, listing detail, blog, about, concierge. |
| `app/(site)/[...segments]/` | Catch-all route that renders content pages from `data/pages.json`. |
| `app/(site)/listing/[slug]/` | One property page, with photos, quote box and booking widget. |
| `app/checkout/page.tsx` | Checkout: itemized bill, coupon and the payment method. |
| `app/(site)/booking-confirmation/` | Confirmation page, read from the booking store. |
| `app/api/bookings/` | Creates a booking with its quoted total. |
| `app/api/checkout/quote/` | Price quote: nights, cleaning, extra guests, pets, coupon, IVA 13%, tourism tax 5%. |
| `app/api/checkout/status/` | Reads booking status. |
| `app/api/checkout/btc/` | **Student work.** Starter route for the Bitcoin payment. |
| `app/api/listings/[id]/availability/` | Availability for a listing (confirmed bookings only). |
| `modules/bookings/booking-quote.ts` | Real pricing logic. Keep it. |
| `modules/bookings/server/booking-store.ts` | Bookings in memory, saved to `.data/bookings.json` (gitignored). `markPaid()` lives here. |
| `modules/bookings/server/bookings.ts`, `modules/checkout/checkout-session.ts` | Booking helpers used by the pages and routes. |
| `modules/coupons/server/coupons.ts`, `modules/coupons/coupon-rules.ts` | Coupon lookup. The sample code is `GETAWAYS10` (10% off). |
| `modules/payments/types.ts` | The `PaymentProvider` contract that students implement. |
| `modules/payments/btc-mock.ts` | **Student work.** Starter stub for the Bitcoin provider. |
| `modules/payments/index.ts` | Exports the active payment provider. |
| `components/organisms/BitcoinPanel.tsx` | **Student work.** Bitcoin payment UI shown on checkout. |
| `components/organisms/CheckoutExtras.tsx`, `components/organisms/CheckoutMethods.tsx` | Checkout bill and payment-method area. |
| `infrastructure/data/local-client.ts` | Local, read-only data client built from `data/*.json`. No database. |
| `modules/content/server/content.ts`, `modules/listings/server/listings.ts`, `shared/media/server/media.ts` | Editorial, catalogue and media queries, with unchanged function signatures. |
| `shared/media/media.ts` | Static media URLs and persisted `/api/media/{id}` or blog media URLs. |
| `data/*.json` | Public site data: pages, posts, listings (with prices), terms, media index. |
| `public/media/` | Photos and files referenced by `data/media.json`. |
| `_test_/support/` | Test-only stand-in for `server-only`. |

### Organization and boundaries

- `app/` owns URLs, route handlers, layouts, metadata and route configuration (`dynamic`, etc.). Large routes compose a server data loader with a template; route files still export Next.js configuration directly.
- `components/atoms/` contains primitives (`ui/`), icons and the active navigation link. `molecules/` contains small compositions such as date/phone fields, post cards and contact details. `organisms/` contains navigation, forms, galleries, checkout and archive blocks; organisms may compose other organisms. `components/seo/` contains JSON-LD rendering.
- `components/templates/` composes home, listing detail, checkout, editorial content and booking confirmation. Their data preparation lives in `modules/site/server/home.ts`, `modules/listings/server/detail.ts`, `modules/checkout/server/checkout.ts`, `modules/content/server/editorial.ts` and `modules/bookings/server/bookings.ts` respectively.
- `modules/` groups business rules by listings, bookings, checkout, payments, coupons, content, concierge and site. Booking date context lives in `modules/bookings/providers/BookingDates.tsx`, not in the visual hierarchy.
- `modules/listings/server/listings.ts` reads the catalogue and its taxonomy joins; `modules/content/server/content.ts` reads editorial pages, posts and site copy; `shared/media/server/media.ts` reads media. Pure category ordering, content descriptions and URL helpers do not depend on server queries.
- `shared/` contains utilities, UI class merging, media helpers, HTML/CSS sanitization and structured data. Server-specific files live under `server/`; existing `server-only` and `use client` boundaries are retained. Import client-safe helpers/types directly, not through mixed barrels.
- `infrastructure/data/local-client.ts` is a local JSON reader, not a Supabase connection. Its historical `publicSupabaseClient` / `hasPublicSupabaseConfig` names remain only to preserve the small internal query API without changing query behavior. JSON imports use `@/data`.
- Tests live in an area's `_test_/` folder. `vitest.config.mts` explicitly discovers those folders; `_test_/organization.test.ts` prevents misplaced tests and obsolete imports. Run `npm test`, `npx tsc --noEmit --incremental false` and `npm run lint` from this directory.
- Data stays in `data/`, images in `public/`, and tool/Docker/environment configuration remains at the project root. The Bitcoin provider and panel remain student stubs.

### Styling

Tailwind CSS 4 is loaded by `app/globals.css` through `@tailwindcss/postcss`.
Use complete utility classes in pages and components, including responsive and interaction variants; do not construct utility names from runtime values.
The global entry contains only design tokens, element defaults and animation keyframes.
Stored Gutenberg blocks receive static utilities in `shared/security/server/sanitize-html.ts`; dynamic images and editor preferences keep their runtime values.

## How data works

- Blog and property catalogue readers, including checkout, use PostgreSQL without JSON fallback. Prices are typed cents/basis points, adapted to the existing presentation shape.
- `infrastructure/data/local-client.ts` remains a read-only JSON interface for static pages and site artwork. Catalogue JSON files are import originals, not an operational data source.
- Catalogue/blog photos are immutable objects in the existing private S3 bucket, served through authorized media routes. Static site images remain in `public/media/`; originals are retained unchanged.
- Bookings are different: they are created while you use the site. They are kept in memory and saved to `.data/bookings.json`, so a dev restart keeps them. Delete that folder to reset all bookings.
- The public data has no guest data, no staff data and no keys.

## Secrets

The example database URL contains local development credentials only. Put real configuration in `.env` (already gitignored), never in source control. Do not add real API keys, wallet seeds or private data to this repo.

## Notes

- This is Next.js 16. Read [AGENTS.md](./AGENTS.md) before you write code, and check `node_modules/next/dist/docs/` when unsure about an API.
- Photos, texts and the brand belong to Getaways El Salvador. See [LICENSE-NOTE.md](./LICENSE-NOTE.md).
