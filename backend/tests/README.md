# Backend tests

Integration tests covering the highest-risk flows:

- `bookings.test.js` — booking creation, multi-day pricing (B1), past-date rejection (D1), self-booking guard (S4), availability calendar enforcement (B3), input length caps (D3), auth/role checks
- `auth.test.js` — registration validation, login flow

## Setup

You need a PostgreSQL database with the schema migrated. Tests run against the same `DATABASE_URL` as your dev environment but use an isolated `email LIKE 'test-%@example.com'` namespace and clean up after themselves.

For complete isolation, point at a separate test database:

```bash
# .env.test
DATABASE_URL=postgres://localhost/bookalocal_test
JWT_SECRET=test-secret-change-me
STRIPE_SECRET_KEY=sk_test_dummy
NODE_ENV=test
```

Migrate the test database once:

```bash
DATABASE_URL=postgres://localhost/bookalocal_test npm run db:migrate
```

## Running

```bash
npm test               # one-off run
npm run test:watch     # rerun on changes
```

Tests run with `--runInBand` (sequentially) to avoid race conditions when multiple tests touch the same DB rows.

## What's covered

| Test                                     | Bug ID it guards | What it asserts                                          |
| ---------------------------------------- | ---------------- | -------------------------------------------------------- |
| Multi-day daily booking total            | B1               | `price_per_day × days × persons`                         |
| Past date rejection                      | D1               | 400 with "future" message                                |
| Guide self-booking                       | S4               | 400 with "own listing" message                           |
| Availability calendar block              | B3               | 400 when date marked `is_available=false`                |
| `special_requests` over 1000 chars       | D3               | 400                                                      |
| Missing token                            | —                | 401                                                      |
| Wrong role (guide booking)               | —                | 403                                                      |
| Password too short                       | M5               | 400                                                      |
| Password without number                  | M5               | 400                                                      |
| Invalid email                            | —                | 400                                                      |
| Valid registration returns token         | —                | 201 with `token` and `user`                              |
| Unknown email login                      | —                | 401 (no enumeration leak)                                |

## What's not yet covered (good next tests)

- Stripe payment intent creation (mock the SDK)
- Webhook idempotency (don't double-update on retry)
- Refund flow when a paid booking is rejected (B2)
- Review creation rate limiting
- Wishlist toggle race conditions

The pattern is the same: import the route, mount it on a minimal Express app, supertest it, clean up.
