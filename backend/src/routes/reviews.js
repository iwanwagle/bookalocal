// reviews.js
const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { query, getClient } = require('../config/database');
const { authenticate, requireRole, requireVerified } = require('../middleware/auth');
const { sanitizeBody } = require('../utils/sanitize');

router.post('/', authenticate, requireRole('traveler'), [
  body('booking_id').isUUID().withMessage('Invalid booking id'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('title').optional().trim().isLength({ max: 200 }),
  body('comment').trim().isLength({ min: 10, max: 2000 }).withMessage('Comment must be between 10 and 2000 characters'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { booking_id, rating, title, comment } = req.body;

  // Verify the booking belongs to this traveler and is completed before opening a transaction
  const bookingResult = await query(
    `SELECT * FROM bookings WHERE id = $1 AND traveler_id = $2 AND status = 'completed'`,
    [booking_id, req.user.id]
  );
  if (!bookingResult.rows.length) return res.status(400).json({ error: 'Can only review completed bookings' });

  const existing = await query('SELECT id FROM reviews WHERE booking_id = $1', [booking_id]);
  if (existing.rows.length) return res.status(409).json({ error: 'Already reviewed' });

  const booking = bookingResult.rows[0];

  // Wrap insert + 2 averages in a single transaction so listing/guide ratings stay in sync
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO reviews (booking_id, listing_id, guide_id, traveler_id, rating, title, comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [booking_id, booking.listing_id, booking.guide_id, req.user.id, rating, title || null, comment]
    );
    await client.query(
      `UPDATE listings SET avg_rating = (SELECT AVG(rating) FROM reviews WHERE listing_id = $1),
        total_reviews = (SELECT COUNT(*) FROM reviews WHERE listing_id = $1) WHERE id = $1`,
      [booking.listing_id]
    );
    await client.query(
      `UPDATE guide_profiles SET avg_rating = (SELECT AVG(rating) FROM reviews WHERE guide_id = $1),
        total_reviews = (SELECT COUNT(*) FROM reviews WHERE guide_id = $1) WHERE id = $1`,
      [booking.guide_id]
    );
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

router.post('/:id/response', authenticate, requireRole('guide'), [
  param('id').isUUID(),
  body('response').trim().isLength({ min: 1, max: 2000 }).withMessage('Response must be between 1 and 2000 characters'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const gp = await query('SELECT id FROM guide_profiles WHERE user_id = $1', [req.user.id]);
    if (!gp.rows.length) return res.status(403).json({ error: 'Guide profile not found' });
    const result = await query(
      `UPDATE reviews SET guide_response = $1, guide_response_at = NOW()
       WHERE id = $2 AND guide_id = $3 RETURNING *`,
      [req.body.response, req.params.id, gp.rows[0].id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Review not found or not yours to respond to' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

module.exports = router;
