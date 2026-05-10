// Booking integration tests — exercises the full happy path:
//   create booking → create-intent (mocked) → webhook payment_intent.succeeded
//     → guide PATCH status=confirmed → guide PATCH status=completed
//
// Plus the critical capacity-check test: two travelers each booking 4 spots
// for an 8-person max listing — the second concurrent attempt must fail.
//
// Stripe is mocked at the require boundary so these tests don't need network
// or a real test secret.

const mockPaymentIntentsCreate = jest.fn();
const mockRefundsCreate = jest.fn();
const mockConstructEvent = jest.fn();

jest.mock('stripe', () => jest.fn().mockImplementation(() => ({
  paymentIntents: { create: mockPaymentIntentsCreate },
  refunds: { create: mockRefundsCreate },
  webhooks: { constructEvent: mockConstructEvent },
})));

const request = require('supertest');
const express = require('express');
const { errorHandler } = require('../src/middleware/errorHandler');
const bookingsRouter = require('../src/routes/bookings');
const paymentsRouter = require('../src/routes/payments');
const {
  createTestUser, createGuideProfile, createListing,
  cleanupTestData, closePool,
} = require('./helpers');
const { query } = require('../src/config/database');

const buildApp = () => {
  const app = express();
  app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/payments', paymentsRouter);
  app.use(errorHandler);
  return app;
};

const futureDate = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

describe('Booking → payment → confirmation → completion (full flow)', () => {
  let app, traveler, guide, guideProfileId, listing;

  beforeAll(async () => {
    app = buildApp();
    traveler = await createTestUser({ role: 'traveler' });
    guide = await createTestUser({ role: 'guide' });
    guideProfileId = await createGuideProfile(guide.id);
    listing = await createListing(guideProfileId, {
      pricing_type: 'daily',
      price_per_day: 5000,
      max_persons: 8,
      min_persons: 1,
    });
  });

  afterAll(async () => {
    await query("DELETE FROM transactions WHERE booking_id IN (SELECT id FROM bookings WHERE booking_ref LIKE 'BL-%')");
    await query("DELETE FROM bookings WHERE booking_ref LIKE 'BL-%'");
    await cleanupTestData();
    await closePool();
  });

  beforeEach(() => {
    mockPaymentIntentsCreate.mockReset();
    mockRefundsCreate.mockReset();
    mockConstructEvent.mockReset();
  });

  test('full happy path: create → pay → confirm → complete; total_earnings updated', async () => {
    // ── 1. Create booking ──────────────────────────────────────────────
    const bookingDate = futureDate(20);
    const createRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${traveler.token}`)
      .send({
        listing_id: listing.id,
        booking_date: bookingDate,
        num_persons: 2,
        duration_days: 1,
      });

    expect(createRes.status).toBe(201);
    const booking = createRes.body;
    expect(booking.status).toBe('pending');
    expect(booking.payment_status).toBe('pending');
    // 5000 * 1 day * 2 persons = 10,000
    expect(parseFloat(booking.base_price)).toBe(10000);
    expect(parseFloat(booking.platform_commission)).toBeCloseTo(1500, 0);
    expect(parseFloat(booking.guide_amount)).toBeCloseTo(8500, 0);

    // ── 2. Create payment intent ───────────────────────────────────────
    mockPaymentIntentsCreate.mockResolvedValueOnce({
      id: 'pi_flow_test_1',
      client_secret: 'pi_flow_test_1_secret_xyz',
    });

    const intentRes = await request(app)
      .post('/api/payments/create-intent')
      .set('Authorization', `Bearer ${traveler.token}`)
      .send({ booking_id: booking.id });

    expect(intentRes.status).toBe(200);
    expect(intentRes.body.client_secret).toBe('pi_flow_test_1_secret_xyz');
    // Stripe was called with the platform commission only (15%)
    expect(mockPaymentIntentsCreate).toHaveBeenCalledTimes(1);
    expect(mockPaymentIntentsCreate.mock.calls[0][0].amount).toBe(150000); // cents

    // ── 3. Simulate Stripe firing the webhook ──────────────────────────
    mockConstructEvent.mockReturnValueOnce({
      type: 'payment_intent.succeeded',
      data: { object: {
        id: 'pi_flow_test_1',
        latest_charge: 'ch_flow_test_1',
        amount: 150000,
        metadata: { booking_id: booking.id, booking_ref: booking.booking_ref },
      }},
    });

    const webhookRes = await request(app)
      .post('/api/payments/webhook')
      .set('stripe-signature', 't=1,v1=mock')
      .set('Content-Type', 'application/json')
      .send(Buffer.from('{}'));

    expect(webhookRes.status).toBe(200);

    // Booking is now paid and still pending (awaiting guide approval)
    const afterPay = await query('SELECT payment_status, status FROM bookings WHERE id = $1', [booking.id]);
    expect(afterPay.rows[0].payment_status).toBe('paid');
    expect(afterPay.rows[0].status).toBe('pending');

    // ── 4. Guide confirms the booking ──────────────────────────────────
    const confirmRes = await request(app)
      .patch(`/api/bookings/${booking.id}/status`)
      .set('Authorization', `Bearer ${guide.token}`)
      .send({ status: 'confirmed' });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.status).toBe('confirmed');

    // ── 5. Guide completes the booking ─────────────────────────────────
    // Snapshot guide profile counters before completion.
    const beforeProfile = await query(
      'SELECT total_bookings, total_earnings FROM guide_profiles WHERE id = $1',
      [guideProfileId]
    );
    const prevBookings = parseInt(beforeProfile.rows[0].total_bookings) || 0;
    const prevEarnings = parseFloat(beforeProfile.rows[0].total_earnings) || 0;

    const completeRes = await request(app)
      .patch(`/api/bookings/${booking.id}/status`)
      .set('Authorization', `Bearer ${guide.token}`)
      .send({ status: 'completed' });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe('completed');
    expect(completeRes.body.completed_at).toBeTruthy();

    // total_earnings AND total_bookings must both have been incremented.
    const afterProfile = await query(
      'SELECT total_bookings, total_earnings FROM guide_profiles WHERE id = $1',
      [guideProfileId]
    );
    expect(parseInt(afterProfile.rows[0].total_bookings)).toBe(prevBookings + 1);
    expect(parseFloat(afterProfile.rows[0].total_earnings)).toBeCloseTo(prevEarnings + 8500, 1);
  });

  test('rejecting a paid booking triggers a refund', async () => {
    const bookingDate = futureDate(25);
    const createRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${traveler.token}`)
      .send({ listing_id: listing.id, booking_date: bookingDate, num_persons: 1, duration_days: 1 });
    expect(createRes.status).toBe(201);
    const booking = createRes.body;

    // Mark paid manually (skipping the intent + webhook dance for this case)
    await query(
      `UPDATE bookings SET payment_status = 'paid', stripe_payment_intent_id = $1, stripe_charge_id = $2 WHERE id = $3`,
      ['pi_reject_test', 'ch_reject_test', booking.id]
    );

    mockRefundsCreate.mockResolvedValueOnce({ id: 're_reject_test', status: 'succeeded' });

    const rejectRes = await request(app)
      .patch(`/api/bookings/${booking.id}/status`)
      .set('Authorization', `Bearer ${guide.token}`)
      .send({ status: 'rejected', guide_notes: 'Cannot accommodate this date.' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe('rejected');
    expect(mockRefundsCreate).toHaveBeenCalledTimes(1);
    expect(mockRefundsCreate.mock.calls[0][0].payment_intent).toBe('pi_reject_test');

    const after = await query('SELECT payment_status FROM bookings WHERE id = $1', [booking.id]);
    expect(after.rows[0].payment_status).toBe('refunded');
  });
});

describe('Capacity check — group bookings cannot exceed max_persons', () => {
  let app, traveler1, traveler2, guide, guideProfileId, listing;

  beforeAll(async () => {
    app = buildApp();
    traveler1 = await createTestUser({ role: 'traveler' });
    traveler2 = await createTestUser({ role: 'traveler' });
    guide = await createTestUser({ role: 'guide' });
    guideProfileId = await createGuideProfile(guide.id);
    // 8-person max listing — easy to reason about
    listing = await createListing(guideProfileId, {
      pricing_type: 'daily',
      price_per_day: 1000,
      max_persons: 8,
      min_persons: 1,
    });
  });

  afterAll(async () => {
    await query("DELETE FROM transactions WHERE booking_id IN (SELECT id FROM bookings WHERE booking_ref LIKE 'BL-%')");
    await query("DELETE FROM bookings WHERE booking_ref LIKE 'BL-%'");
    await cleanupTestData();
    await closePool();
  });

  test('two sequential bookings that fit (4 + 4) both succeed', async () => {
    const date = futureDate(40);
    const b1 = await request(app).post('/api/bookings')
      .set('Authorization', `Bearer ${traveler1.token}`)
      .send({ listing_id: listing.id, booking_date: date, num_persons: 4, duration_days: 1 });
    expect(b1.status).toBe(201);

    const b2 = await request(app).post('/api/bookings')
      .set('Authorization', `Bearer ${traveler2.token}`)
      .send({ listing_id: listing.id, booking_date: date, num_persons: 4, duration_days: 1 });
    expect(b2.status).toBe(201);
  });

  test('a third booking that overflows is rejected with spots_remaining: 0', async () => {
    // Same date as the test above is now full (4 + 4 = 8 = max)
    const date = futureDate(40);
    const b3 = await request(app).post('/api/bookings')
      .set('Authorization', `Bearer ${traveler1.token}`)
      .send({ listing_id: listing.id, booking_date: date, num_persons: 1, duration_days: 1 });
    expect(b3.status).toBe(400);
    expect(b3.body.spots_remaining).toBe(0);
    expect(b3.body.error).toMatch(/fully booked/i);
  });

  test('a partial overflow is rejected with the correct spots_remaining count', async () => {
    const date = futureDate(41);
    const b1 = await request(app).post('/api/bookings')
      .set('Authorization', `Bearer ${traveler1.token}`)
      .send({ listing_id: listing.id, booking_date: date, num_persons: 5, duration_days: 1 });
    expect(b1.status).toBe(201);

    // 5 booked, 3 remaining; trying to book 4 should fail with spots_remaining=3.
    const b2 = await request(app).post('/api/bookings')
      .set('Authorization', `Bearer ${traveler2.token}`)
      .send({ listing_id: listing.id, booking_date: date, num_persons: 4, duration_days: 1 });
    expect(b2.status).toBe(400);
    expect(b2.body.spots_remaining).toBe(3);
    expect(b2.body.error).toMatch(/3 spots? left/i);
  });

  test('concurrent bookings cannot collectively overbook the listing', async () => {
    // Two travelers fire booking creates simultaneously, each requesting
    // 5 spots on a fresh date. With max_persons = 8, only one can win.
    const date = futureDate(42);

    const [r1, r2] = await Promise.all([
      request(app).post('/api/bookings')
        .set('Authorization', `Bearer ${traveler1.token}`)
        .send({ listing_id: listing.id, booking_date: date, num_persons: 5, duration_days: 1 }),
      request(app).post('/api/bookings')
        .set('Authorization', `Bearer ${traveler2.token}`)
        .send({ listing_id: listing.id, booking_date: date, num_persons: 5, duration_days: 1 }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    // Exactly one 201 (winner) and one 400 (loser).
    expect(statuses).toEqual([201, 400]);

    // The DB should have only the winning booking — never two summing > 8.
    const dbCheck = await query(
      `SELECT COALESCE(SUM(num_persons), 0)::int AS total
         FROM bookings
        WHERE listing_id = $1 AND booking_date = $2 AND status IN ('pending','confirmed')`,
      [listing.id, date]
    );
    expect(dbCheck.rows[0].total).toBeLessThanOrEqual(8);
    expect(dbCheck.rows[0].total).toBe(5); // winner's persons only
  });
});
