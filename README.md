# Kaloriräknare

Mobile-first calorie and protein logging PWA with Google sign-in, a shared ingredient catalogue, EAN-13 scanning, meal copying, and saved recipes.

## Local setup

Requirements: Node.js 22+, npm, PostgreSQL with permission to install `pg_trgm`, and a Firebase project with Google Authentication enabled.

1. Copy `.env.example` to `.env` and enter the application and migration database credentials.
2. Add the local/deployed hostname to Firebase Authentication's authorized domains.
3. Run `npm install`.
4. Run `npm run db:migrate`.
5. Run `npm run dev` and open `http://localhost:3000`.

The public `GET /api/health` route is a process liveness check. `GET /api/ready` also verifies the database connection and should be used for deployment readiness.

## Commands

- `npm run dev` — start Express and Vite in development.
- `npm test` — run the unit, component-contract, query, and HTTP tests.
- `npm run lint` — run strict TypeScript checking.
- `npm run build` — build the client and production server.
- `npm run db:generate` — generate a migration from schema changes.
- `npm run db:migrate` — apply pending migrations.

## Deliberate product rules

- Barcodes are either absent or exactly 13 numeric EAN digits.
- The scanner bundle is eagerly loaded so opening the scanner has no code-loading delay.
- Ingredients are community-managed: every authenticated user can create, update, and soft-delete every active ingredient. `created_by_user_id` is audit metadata, not an authorization boundary.
- Meals and recipes are private to a Firebase UID. Their client cache keys include that UID and private caches are removed when authentication changes.
- Recipe items and copied meals use nutrition snapshots. Later edits to an ingredient do not retroactively change what a recipe displayed or what a copied meal logs.
- Quick-log rows cannot be saved as recipe ingredients. This avoids recipes with unresolvable synthetic ingredients.

The API intentionally has no compatibility layer for the earlier loose meal payloads. Meal requests must use the explicit `kind: "ingredient"` or `kind: "quick"` contracts in `src/validation.ts`.

The first migration clears unsupported barcode values and clears later duplicates before adding the active-barcode uniqueness constraint. Ingredient records themselves are retained.
