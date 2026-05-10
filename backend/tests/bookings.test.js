// Booking creation tests — covers the recent bug fixes
// Run with: NODE_ENV=test DATABASE_URL=postgres://... npm test

const request = require('supertest');
const express = require('express');
const { authenticate } = require('../src/middleware/auth');
const { errorHandler } = require('../src/middleware/errorHandler');
const bookingsRouter = require('../src/routes/bookings');
const {
  createTestUser, createGuideProfile, createListing,
  cleanupTestData, closePool,
} = require('./helpers');
const { query } = require('../src/config/database');

// Build a minimal app for isolated route testing
const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/bookings', bookingsRouter);
  app.use(errorHandler);
  return app;
};

describe('POST /api/bookings — booking creation', () => {
  let app, traveler, guide, guideProfileId, listing;

  beforeAll(async () => {
    app = buildApp();
    traveler = await createTestUser({ role: 'traveler' });
    guide = await createTestUser({ role: 'guide' });
    guideProfileId = await createGuideProfile(guide.id);
    listing = await createListing(guideProfileId, { pricing_type: 'daily', price_per_day: 5000 });
  });

  afterAll(async () => {
    await cleanupTestData();
    await closePool();
  });

  // --- B1: multi-day pricing ---
  test('B1: multi-day daily booking charges for the full number of days', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${traveler.token}`)
      .send({
        listing_id: listing.id,
        booking_date: tomorrow,
        num_persons: 2,
        duration_days: 5,
      });

    expect(res.status).toBe(201);
    // 5000 NPR/day * 5 days * 2 persons = 50,000
    expect(parseFloat(res.body.base_price)).toBe(50000);
    expect(parseFloat(res.body.platform_commission)).toBeCloseTo(7500, 0);
  });

  test('B1: missing duration_days defaults to 1 (backwards compatible)', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${traveler.token}`)
      .send({
        listing_id: listing.id,
        booking_date: tomorrow,
        num_persons: 1,
      });
    expect(res.status).toBe(201);
    expect(parseFloat(res.body.base_price)).toBe(5000);
  });

  // --- D1: past date rejection ---
  test('D1: past dates are rejected with 400', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${traveler.token}`)
      .send({
        listing_id: listing.id,
        booking_date: yesterday,
        num_persons: 1,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/future/i);
  });

  // --- S4: guide cannot book own listing ---
  test('S4: a guide cannot book their own listing', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    // Need to create a traveler-role token for the guide user (manual JWT)
    const jwt = require('jsonwebtoken');
    const guideAsTravelerToken = jwt.sign(
      { userId: guide.id, role: 'traveler' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${guideAsTravelerToken}`)
      .send({
        listing_id: listing.id,
        booking_date: tomorrow,
        num_persons: 1,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/own listing/i);
  });

  // --- B3: blocked-availability dates are rejected ---
  test('B3: a date marked unavailable in the calendar cannot be booked', async () => {
    const blockedDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    // Insert an availability row marking this date as unavailable
    await query(
      `INSERT INTO availability (listing_id, date, is_available) VALUES ($1, $2, false)
       ON CONFLICT (listing_id, date, start_time) DO UPDATE SET is_available = false`,
      [listing.id, blockedDate]
    );

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${traveler.token}`)
      .send({
        listing_id: listing.id,
        booking_date: blockedDate,
        num_persons: 1,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not available/i);

    // cleanup
    await query('DELETE FROM availability WHERE listing_id = $1 AND date = $2', [listing.id, blockedDate]);
  });

  // --- D3: input length cap ---
  test('D3: special_requests over 1000 chars is rejected', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const longText = 'x'.repeat(1500);
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${traveler.token}`)
      .send({
        listing_id: listing.id,
        booking_date: tomorrow,
        num_persons: 1,
        special_requests: longText,
      });
    expect(res.status).toBe(400);
  });

  // --- Auth / role enforcement ---
  test('Returns 401 without auth token', async () => {
    const res = await request(app).post('/api/bookings').send({});
    expect(res.status).toBe(401);
  });

  test('Returns 403 when a guide tries to book (wrong role)', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${guide.token}`)
      .send({
        listing_id: listing.id,
        booking_date: tomorrow,
        num_persons: 1,
      });
    expect(res.status).toBe(403);
  });
});
