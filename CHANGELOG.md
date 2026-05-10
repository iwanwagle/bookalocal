# Bookalocal MVP — v1.1.0 changelog

This release addresses the security, scaling, and correctness items flagged in the audit.

## 🔒 Security

### JWT moved out of localStorage into httpOnly cookies
- Access tokens were JS-readable (XSS-exfiltrable) in `localStorage`. Now:
  - **`bl_access`** — httpOnly, ~15min, set on every login/refresh
  - **`bl_refresh`** — httpOnly, 30 days, scoped to `/api/auth`, used only by `/auth/refresh` and `/auth/logout`
- Both cookies are `SameSite=Lax`, `Secure` in production, optional `Domain` via `COOKIE_DOMAIN`.
- Native (mobile/CLI) clients can opt out of cookies by sending `X-Client-Type: native`; they continue to receive raw tokens in the JSON body.
- Server now sets `app.set('trust proxy', 1)` so secure cookies and rate-limit IPs work behind Railway/Cloudflare.
- CORS now requires `credentials: true` and a specific origin; `CLIENT_URL` accepts a comma-separated allowlist.

### Reset-password and email-verify tokens stored as SHA-256 hashes
- Even if the DB leaks, the raw tokens in users' email links remain unusable. Both `users.reset_token` and `users.email_verify_token` now hold the hash.

### Files
- New: `backend/src/utils/cookies.js`
- Replaced: `backend/src/routes/auth.js`, `backend/src/server.js`, `backend/src/middleware/auth.js`, `backend/src/utils/socketHandlers.js`
- Replaced: `frontend/src/utils/api.js`, `frontend/src/context/authStore.js`, `frontend/src/app/providers.js`

## 🏗️ Horizontal scaling

### Redis-backed user cache
- Was an in-memory `Map` per-process — under multiple instances, suspend/role changes wouldn't propagate, and cache hit rates were terrible. Now backed by Redis with `PX` TTL of 60s.
- New: `backend/src/config/redis.js` exporting `getRedis()` and `duplicateRedis()`.
- Falls back to an **in-memory shim** (only used if `REDIS_URL` is unset) so local dev and `npm test` work without Redis. Logs a clear warning at startup when running without Redis.

### Socket.io Redis adapter
- Without it, a chat message sent on instance #1 was invisible to a user connected to instance #2. Now wired via `@socket.io/redis-adapter` using two duplicate Redis connections.
- Falls back to single-instance in dev with the shim.

### Files
- New: `backend/src/config/redis.js`
- New deps: `ioredis`, `@socket.io/redis-adapter`, `cookie`, `cookie-parser`

## 🎫 Bookings

### Capacity check (concurrent overbooking fix)
- Previously, two parallel POSTs for the same date could both pass and both insert: the listing's `max_persons` was checked only against `num_persons` of *this* request, never against existing bookings.
- Now, inside the existing `FOR UPDATE` transaction on `listings`, we sum `num_persons` of all `pending` + `confirmed` bookings for that listing+date and reject if the new request exceeds remaining capacity.
- The `FOR UPDATE` lock serializes concurrent attempts, so by the time the second transaction reads, the first's insert is visible — no torn reads.
- New error response includes `spots_remaining` so the frontend can show "only 3 spots left" type messaging.
- Test coverage: `tests/booking-flow.test.js` includes a sequential test, an exact-fill test, a partial-overflow test, and a concurrent `Promise.all` test that asserts only one of two competing 5-person requests succeeds.

### Stripe initialized at module scope
- Was being re-instantiated per request in `bookings.js`. Now hoisted to top of file (already top-level in `payments.js`).

### `total_earnings` actually updated on completion
- Column existed but was never written to. On `status = 'completed'` we now bump both `total_bookings` and `total_earnings` (by `guide_amount`).

### `cancellation_reason` consolidation
- Schema had two near-identical columns (`cancellation_reason` + `cancel_reason`) written by different code paths. Migration drops `cancel_reason` (copying any data into `cancellation_reason` first); all writers (cron, bookings cancel endpoint) now use the single column.

### Files
- Replaced: `backend/src/routes/bookings.js`
- Modified: `backend/src/database/migrate.js`, `backend/src/utils/cron.js`

## 🗂️ Admin

### Pagination on previously-unpaginated endpoints
- `GET /admin/listings/pending` and `GET /admin/kyc-pending` could return tens of MB on a busy site. Both now paginated.
- All admin list endpoints now share a consistent envelope: `{ data: [...], pagination: { total, page, limit, pages } }`.
- `GET /admin/users` and `GET /admin/bookings` switched from `total: rowCount` (the page count) to `total` (the actual row count) — this was a latent bug.

### Files
- Replaced: `backend/src/routes/admin.js`

## 📝 Editing listings

### Fixed two real bugs in the edit flow
- Backend `GET /api/listings/:id` was hard-coded to `WHERE status = 'approved'`, which blocked guides from fetching their own pending or rejected listings to edit them. Now also visible to the owner and admins regardless of status.
- Frontend listing form was reading `data.listing` from the API response, but the endpoint returns the listing fields spread at the top level (alongside `reviews` and `is_wishlisted`). Edit form would silently render empty.
- The route file at `frontend/src/app/guide/listings/[id]/edit/page.js` (a re-export of the new-listing page) is kept; the new-listing page already handles `isEditing` mode via `useParams().id`. With both bugs fixed, edit now works end-to-end.

### Files
- Modified: `backend/src/routes/listings.js`, `frontend/src/app/guide/listings/new/page.js`

## 🔍 Search

### `search_vector` trigger
- The `BEFORE INSERT OR UPDATE` trigger that maintains `listings.search_vector` was already in place — flagged it incorrectly in the audit. Verified working.
- One improvement: trigger now also includes `category` text in the `search_vector`, so users can search "hiking" / "cultural" / etc. directly.

## 📑 Types

### JSDoc shared models
- New `backend/src/types.js` declares `@typedef` for `User`, `GuideProfile`, `Listing`, `Booking`, `Review`, `AuthResponse`, and `Paginated<T>`. Other files can import via:
  ```js
  /** @typedef {import('./types').Booking} Booking */
  ```
  …which gives editors / `tsc --noEmit` enough info to catch typos in column names without taking on a full TS migration.

## 🗃️ Database

### New indexes (the few that were genuinely missing)
- `idx_bookings_listing_date_status (listing_id, booking_date, status)` — supports the new capacity check
- `idx_listings_city_status_active (city, status, is_active)` — search filter combo
- `idx_bookings_date_reminder` — partial index for the reminder cron
- `idx_listings_pending_created` — partial index for admin pending-listings sort
- (Most other indexes I flagged were already present — verified after closer reading.)

### Migration safety
- `cancel_reason` drop is wrapped in a `DO $$` block that checks `information_schema.columns` first, so the migration is idempotent on both fresh and existing DBs.

## 🧪 Tests

### Webhook handler tests (`tests/payments.test.js`)
Covers:
- Bad signature → 400
- `payment_intent.succeeded` happy path: booking marked paid, transaction inserted
- Idempotent replay: second delivery of the same event is a no-op (transaction count stays at 1)
- Missing `booking_id` metadata → ignored, 200
- Unknown `booking_id` → ignored, 200
- `payment_intent.payment_failed` → booking marked failed
- `charge.refunded` → booking marked refunded
- Unhandled event types → 200, no error

### Booking integration tests (`tests/booking-flow.test.js`)
Two suites:
- **Full happy path** — create → create-intent → webhook → confirm → complete; asserts `total_earnings` and `total_bookings` are bumped on completion. Plus a "rejecting a paid booking refunds via Stripe" test.
- **Capacity** — sequential fill, overflow rejection with `spots_remaining`, partial overflow, and a concurrent `Promise.all` race that asserts at most one of two competing requests inserts.

Stripe is mocked at the `require('stripe')` boundary, so neither suite needs network or a real test secret.

## 📦 Dependencies

Added to `backend/package.json` (version bump → `1.1.0`):
- `cookie@^0.6.0`, `cookie-parser@^1.4.6` — request cookie parsing
- `ioredis@^5.3.2`, `@socket.io/redis-adapter@^8.3.0` — Redis client + Socket.io adapter

## 🌱 Environment

Added to `.env.example`:
- `REDIS_URL` (required in production; in-memory shim used if blank)
- `COOKIE_DOMAIN` (optional — set when API and frontend share a parent domain)
- `JWT_EXPIRES_IN` default tightened from `7d` to `15m` (refresh tokens handle continuity)

## ⚠️ Migration / deployment notes

1. **Run the migration** — `npm run db:migrate`. The `cancel_reason` column drop is idempotent.
2. **Set `REDIS_URL`** before scaling beyond a single instance.
3. **Existing logged-in users** will need to log in again after deploy: their old `bl-auth` localStorage entry no longer contains a token, and there's no `bl_refresh` cookie yet. The bootstrap flow on app load will detect this and silently surface the login screen.
4. **Reverse-proxy header forwarding** must be enabled (Railway, Vercel, etc. do this by default) for `secure` cookies and per-IP rate limiting to behave correctly.

## What was NOT changed

Per scope, the following audit items were left for a follow-up release:
- Currency hard-coded to USD in Stripe (Nepal market should ideally be NPR)
- Cancellation policy is enforced by display-only text; the cancel endpoint accepts cancellations regardless of policy timing
- Travelers pay (15% commission) before the guide accepts the booking — refund-on-reject is the recovery path, but a hold-then-capture would be cleaner
- Stripe Connect for guide payouts (guide_amount accumulates but settlement is manual)
