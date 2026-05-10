// Auth flow tests
const request = require('supertest');
const express = require('express');
const authRoutes = require('../src/routes/auth');
const { errorHandler } = require('../src/middleware/errorHandler');
const { createTestUser, cleanupTestData, closePool } = require('./helpers');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use(errorHandler);
  return app;
};

describe('POST /api/auth/register — registration validation', () => {
  let app;
  beforeAll(() => { app = buildApp(); });
  afterAll(async () => { await cleanupTestData(); await closePool(); });

  test('Rejects passwords shorter than 8 chars', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'test-shortpw@example.com', password: 'abc1', first_name: 'Test', last_name: 'User',
    });
    expect(res.status).toBe(400);
  });

  test('Rejects passwords without a number', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'test-noumber@example.com', password: 'abcdefghij', first_name: 'Test', last_name: 'User',
    });
    expect(res.status).toBe(400);
  });

  test('Rejects invalid email format', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'not-an-email', password: 'Password123', first_name: 'Test', last_name: 'User',
    });
    expect(res.status).toBe(400);
  });

  test('Accepts valid registration', async () => {
    const email = `test-valid-${Date.now()}@example.com`;
    const res = await request(app).post('/api/auth/register').send({
      email, password: 'Password123', first_name: 'Test', last_name: 'User',
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(email);
  });
});

describe('POST /api/auth/login', () => {
  let app, user;
  beforeAll(async () => {
    app = buildApp();
    user = await createTestUser({ role: 'traveler' });
  });
  afterAll(async () => { await cleanupTestData(); await closePool(); });

  test('Rejects unknown email with 401 (not 404 — prevents enumeration)', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'definitely-not-a-real-user@example.com', password: 'Password123',
    });
    expect(res.status).toBe(401);
  });

  // Note: full bcrypt-validated login isn't tested here because the test user has a dummy hash.
  // The point of this file is to exercise the validation layer and 401 path.
});
