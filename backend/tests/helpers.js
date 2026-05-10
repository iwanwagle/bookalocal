// Shared test helpers
const jwt = require('jsonwebtoken');
const { query, pool } = require('../src/config/database');

// Set test env variables before any module that reads them
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest-runs-only';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key_for_unit_tests';
process.env.COMMISSION_RATE = '0.15';

const generateTestToken = (userId, role = 'traveler') =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });

// Insert a fixture user. Returns { id, email, token }.
const createTestUser = async ({ role = 'traveler', email } = {}) => {
  const testEmail = email || `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const result = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, is_verified)
     VALUES ($1, $2, $3, $4, $5, true, true) RETURNING id`,
    [testEmail, '$2a$12$dummyhashfortestsonly.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Test', 'User', role]
  );
  const userId = result.rows[0].id;
  return { id: userId, email: testEmail, token: generateTestToken(userId, role) };
};

const createGuideProfile = async (userId) => {
  const result = await query(
    `INSERT INTO guide_profiles (user_id, bio, languages, specialties, years_experience, city, country, profile_status, id_verified)
     VALUES ($1, 'Test guide bio for jest', ARRAY['English'], ARRAY['hiking'], 5, 'Kathmandu', 'Nepal', 'approved', true)
     RETURNING id`,
    [userId]
  );
  return result.rows[0].id;
};

const createListing = async (guideProfileId, overrides = {}) => {
  const defaults = {
    title: 'Test Listing for Jest Tests',
    description: 'A long enough description for validation purposes — at least fifty characters total.',
    pricing_type: 'daily',
    price_per_day: 5000,
    min_persons: 1,
    max_persons: 8,
    city: 'Kathmandu',
    country: 'Nepal',
    status: 'approved',
    is_active: true,
    ...overrides,
  };
  const result = await query(
    `INSERT INTO listings (guide_id, title, description, category, pricing_type,
      price_per_hour, price_per_day, package_price, package_duration_days,
      min_persons, max_persons, city, country, latitude, longitude, status, is_active)
     VALUES ($1, $2, $3, 'hiking', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      guideProfileId, defaults.title, defaults.description, defaults.pricing_type,
      defaults.price_per_hour || null, defaults.price_per_day || null,
      defaults.package_price || null, defaults.package_duration_days || null,
      defaults.min_persons, defaults.max_persons,
      defaults.city, defaults.country, 27.7172, 85.3240,
      defaults.status, defaults.is_active,
    ]
  );
  return result.rows[0];
};

// Clean up all test data inserted during a test run
const cleanupTestData = async () => {
  await query("DELETE FROM bookings WHERE booking_ref LIKE 'BL-%' AND created_at > NOW() - interval '1 hour'");
  await query("DELETE FROM listings WHERE title LIKE 'Test Listing for Jest%'");
  await query("DELETE FROM guide_profiles WHERE bio = 'Test guide bio for jest'");
  await query("DELETE FROM users WHERE email LIKE 'test-%@example.com'");
};

const closePool = () => pool.end();

module.exports = {
  generateTestToken,
  createTestUser,
  createGuideProfile,
  createListing,
  cleanupTestData,
  closePool,
};
