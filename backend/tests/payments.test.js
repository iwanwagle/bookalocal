// Webhook handler tests.
//
// Strategy: mock the `stripe` package so we can:
//   1. Pass arbitrary events through `stripe.webhooks.constructEvent` without
//      having to sign them with a real webhook secret.
//   2. Make `constructEvent` throw when we want to simulate a bad signature.
//
// Because payments.js calls `require('stripe')(SECRET)(...)`, the mock has to
// return a constructor function. See setup below.

const mockConstructEvent = jest.fn();
const mockRefundsCreate = jest.fn();
const mockPaymentIntentsCreate = jest.fn();

jest.mock('stripe', () => {
  // The factory is called as: require('stripe')(secret)
  return jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    refunds: { create: mockRefundsCreate },
    paymentIntents: { create: mockPaymentIntentsCreate },
  }));
});

const request = require('supertest');
const express = require('express');
const paymentRoutes = require('../src/routes/payments');
const { errorHandler } = require('../src/middleware/errorHandler');
const { query } = require('../src/config/database');
const {
  createTestUser,
  createGuideProfile,
  createListing,
  cleanupTestData,
  closePool,
} = require('./helpers');

// Build an express app that wires payments exactly the way server.js does.
// Important: webhook needs raw body BEFORE express.json().
const buildApp = () => {
  const app = express();
  app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use('/api/payments', paymentRoutes);
  app.use(errorHandler);
  return app;
};

describe('POST /api/payments/webhook', () => {
  let app;
  let traveler, guide, guideProfileId, listing, booking;

  beforeAll(async () => {
    app = buildApp();

    traveler = await createTestUser({ role: 'traveler' });
    guide = await createTestUser({ role: 'guide' });
    guideProfileId = await createGuideProfile(guide.id);
    listing = await createListing(guideProfileId);

    // Insert a booking we'll be acting on. payment_status starts as 'pending'.
    const bookingResult = await query(
      `INSERT INTO bookings (
         booking_ref, listing_id, traveler_id, guide_id, booking_date,
         num_persons, pricing_type, base_price, platform_commission,
         guide_amount, total_amount, status, payment_status,
         stripe_payment_intent_id
       ) VALUES (
         'BL-TEST-WEBHOOK-1', $1, $2, $3, CURRENT_DATE + interval '14 days',
         2, 'daily', 10000, 1500, 8500, 10000, 'pending', 'pending',
         'pi_test_webhook_1'
       ) RETURNING *`,
      [listing.id, traveler.id, guideProfileId]
    );
    booking = bookingResult.rows[0];
  });

  afterAll(async () => {
    await query("DELETE FROM transactions WHERE booking_id IN (SELECT id FROM bookings WHERE booking_ref LIKE 'BL-TEST-WEBHOOK-%')");
    await query("DELETE FROM bookings WHERE booking_ref LIKE 'BL-TEST-WEBHOOK-%'");
    await cleanupTestData();
    await closePool();
  });

  beforeEach(() => {
    mockConstructEvent.mockReset();
    mockRefundsCreate.mockReset();
  });

  test('rejects request with bad signature (400)', async () => {
    mockConstructEvent.mockImplementationOnce(() => {
      throw new Error('No signatures found matching the expected signature');
    });

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('stripe-signature', 'v1=garbage')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify({ type: 'payment_intent.succeeded' })));

    expect(res.status).toBe(400);
    expect(res.text).toMatch(/Webhook Error/);
  });

  test('payment_intent.succeeded marks booking paid and inserts a transaction', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'payment_intent.succeeded',
      data: { object: {
        id: 'pi_test_webhook_1',
        latest_charge: 'ch_test_webhook_1',
        amount: 150000, // cents
        metadata: { booking_id: booking.id, booking_ref: booking.booking_ref },
      }},
    });

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('stripe-signature', 't=123,v1=mock')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify({}))); // body content irrelevant — we mock constructEvent

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    const after = await query('SELECT payment_status, stripe_charge_id FROM bookings WHERE id = $1', [booking.id]);
    expect(after.rows[0].payment_status).toBe('paid');
    expect(after.rows[0].stripe_charge_id).toBe('ch_test_webhook_1');

    const txns = await query("SELECT * FROM transactions WHERE booking_id = $1 AND type = 'charge'", [booking.id]);
    expect(txns.rows.length).toBe(1);
    expect(txns.rows[0].stripe_id).toBe('pi_test_webhook_1');
  });

  test('idempotent: replayed payment_intent.succeeded does not duplicate', async () => {
    // Same event again — should be a no-op now that booking is already paid.
    mockConstructEvent.mockReturnValueOnce({
      type: 'payment_intent.succeeded',
      data: { object: {
        id: 'pi_test_webhook_1',
        latest_charge: 'ch_test_webhook_1',
        amount: 150000,
        metadata: { booking_id: booking.id, booking_ref: booking.booking_ref },
      }},
    });

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('stripe-signature', 't=124,v1=mock')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify({})));

    expect(res.status).toBe(200);

    const txns = await query("SELECT * FROM transactions WHERE booking_id = $1 AND type = 'charge'", [booking.id]);
    expect(txns.rows.length).toBe(1); // still one — replay was safely skipped
  });

  test('event with no booking_id metadata is ignored (200, no DB writes)', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_orphan', amount: 10, metadata: {} } },
    });

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('stripe-signature', 't=125,v1=mock')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify({})));

    expect(res.status).toBe(200);
  });

  test('event referencing unknown booking is ignored (200)', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'payment_intent.succeeded',
      data: { object: {
        id: 'pi_unknown',
        amount: 10,
        metadata: { booking_id: '00000000-0000-0000-0000-000000000000' },
      }},
    });

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('stripe-signature', 't=126,v1=mock')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify({})));

    expect(res.status).toBe(200);
  });

  test('payment_intent.payment_failed marks booking failed', async () => {
    // Insert a fresh pending booking to fail.
    const failBookingRes = await query(
      `INSERT INTO bookings (
         booking_ref, listing_id, traveler_id, guide_id, booking_date,
         num_persons, pricing_type, base_price, platform_commission,
         guide_amount, total_amount, status, payment_status,
         stripe_payment_intent_id
       ) VALUES (
         'BL-TEST-WEBHOOK-FAIL', $1, $2, $3, CURRENT_DATE + interval '15 days',
         1, 'daily', 5000, 750, 4250, 5000, 'pending', 'pending',
         'pi_test_webhook_fail'
       ) RETURNING *`,
      [listing.id, traveler.id, guideProfileId]
    );
    const failBooking = failBookingRes.rows[0];

    mockConstructEvent.mockReturnValueOnce({
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_test_webhook_fail', metadata: { booking_id: failBooking.id } } },
    });

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('stripe-signature', 't=127,v1=mock')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify({})));

    expect(res.status).toBe(200);
    const after = await query('SELECT payment_status FROM bookings WHERE id = $1', [failBooking.id]);
    expect(after.rows[0].payment_status).toBe('failed');
  });

  test('charge.refunded flips booking to refunded', async () => {
    // booking is currently paid + has stripe_charge_id = 'ch_test_webhook_1'.
    mockConstructEvent.mockReturnValueOnce({
      type: 'charge.refunded',
      data: { object: { id: 'ch_test_webhook_1' } },
    });

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('stripe-signature', 't=128,v1=mock')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify({})));

    expect(res.status).toBe(200);
    const after = await query('SELECT payment_status FROM bookings WHERE id = $1', [booking.id]);
    expect(after.rows[0].payment_status).toBe('refunded');
  });

  test('unhandled event type is acknowledged (200) without error', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_unrelated' } },
    });

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('stripe-signature', 't=129,v1=mock')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify({})));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});
