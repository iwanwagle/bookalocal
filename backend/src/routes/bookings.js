const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { body, param, validationResult } = require('express-validator');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { query, getClient } = require('../config/database');
const { authenticate, requireRole, requireVerified } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { sanitizeBody } = require('../utils/sanitize');
const email = require('../utils/emailQueue');
const { streamReceipt } = require('../utils/pdf');

// Booking ref: year + base36-encoded ms-of-year + 4 random chars.
const generateRef = () => {
  const year = new Date().getFullYear();
  const start = new Date(year, 0, 1).getTime();
  const offset = Date.now() - start;
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `BL-${year}-${offset.toString(36).toUpperCase()}-${rand}`;
};

// POST /api/bookings - Create booking
router.post('/', authenticate, requireRole('traveler'), requireVerified, sanitizeBody(['special_requests']), [
  body('listing_id').isUUID(),
  body('booking_date').isDate(),
  body('num_persons').isInt({ min: 1, max: 50 }),
  body('duration_hours').optional().isInt({ min: 1, max: 24 }),
  body('duration_days').optional().isInt({ min: 1, max: 365 }),
  body('special_requests').optional().isLength({ max: 1000 }),
  body('start_time').optional().matches(/^\d{2}:\d{2}(:\d{2})?$/),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { listing_id, booking_date, start_time, num_persons, special_requests } = req.body;

    // Wrap availability + capacity check + insert in a transaction with row-level
    // locking on the listing. This prevents two concurrent requests from both
    // passing validation and both inserting.
    const client = await getClient();
    let booking, listing;
    try {
      await client.query('BEGIN');

      // SELECT ... FOR UPDATE serializes concurrent bookings for the same listing.
      const listingResult = await client.query(
        `SELECT l.*, gp.id as guide_id, gp.user_id as guide_user_id
         FROM listings l
         JOIN guide_profiles gp ON gp.id = l.guide_id
         WHERE l.id = $1 AND l.status = $2 AND l.is_active = true
         FOR UPDATE OF l`,
        [listing_id, 'approved']
      );
      if (!listingResult.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Listing not found or unavailable' });
      }
      listing = listingResult.rows[0];

      if (listing.guide_user_id === req.user.id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'You cannot book your own listing' });
      }

      // Reject past dates (and dates older than today)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const requestedDate = new Date(booking_date);
      if (Number.isNaN(requestedDate.getTime()) || requestedDate < today) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Booking date must be today or in the future' });
      }

      // Re-check date-level availability inside the transaction
      const blocked = await client.query(
        `SELECT 1 FROM availability WHERE listing_id = $1 AND date = $2 AND is_available = false LIMIT 1`,
        [listing_id, booking_date]
      );
      if (blocked.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'The guide is not available on this date. Please choose another.' });
      }

      // Per-listing min/max group size
      if (num_persons < listing.min_persons || num_persons > listing.max_persons) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Persons must be between ${listing.min_persons} and ${listing.max_persons}` });
      }

      // CAPACITY CHECK — sum existing pending+confirmed booking persons for this
      // listing+date and ensure adding num_persons doesn't exceed max_persons.
      // The FOR UPDATE on the listing serializes this with concurrent bookings,
      // so by the time we read here, any committed concurrent insert is visible.
      const capacityResult = await client.query(
        `SELECT COALESCE(SUM(num_persons), 0)::int AS booked_persons
           FROM bookings
          WHERE listing_id = $1
            AND booking_date = $2
            AND status IN ('pending', 'confirmed')`,
        [listing_id, booking_date]
      );
      const bookedPersons = capacityResult.rows[0].booked_persons;
      const remaining = listing.max_persons - bookedPersons;
      if (num_persons > remaining) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: remaining <= 0
            ? 'This experience is fully booked on this date.'
            : `Only ${remaining} ${remaining === 1 ? 'spot' : 'spots'} left on this date.`,
          spots_remaining: Math.max(0, remaining),
        });
      }

      // Calculate pricing
      const commissionRate = parseFloat(process.env.COMMISSION_RATE) || 0.15;
      let base_price;
      if (listing.pricing_type === 'hourly') {
        const hours = req.body.duration_hours || 2;
        base_price = listing.price_per_hour * hours * num_persons;
      } else if (listing.pricing_type === 'daily') {
        const days = req.body.duration_days || 1;
        base_price = listing.price_per_day * days * num_persons;
      } else {
        base_price = listing.package_price * num_persons;
      }
      const platform_commission = parseFloat((base_price * commissionRate).toFixed(2));
      const guide_amount = parseFloat((base_price - platform_commission).toFixed(2));

      const result = await client.query(`
        INSERT INTO bookings (
          booking_ref, listing_id, traveler_id, guide_id, booking_date, start_time,
          num_persons, pricing_type, base_price, platform_commission, guide_amount,
          total_amount, special_requests, meeting_point
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING *
      `, [
        generateRef(), listing_id, req.user.id, listing.guide_id,
        booking_date, start_time, num_persons, listing.pricing_type,
        base_price, platform_commission, guide_amount, base_price,
        special_requests, listing.meeting_point
      ]);

      await client.query('COMMIT');
      booking = result.rows[0];
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

    // Email the guide (non-blocking)
    try {
      const guideUserRes = await query(
        `SELECT u.email, u.first_name, u.last_name, u.phone
         FROM guide_profiles gp JOIN users u ON u.id = gp.user_id WHERE gp.id = $1`,
        [listing.guide_id]
      );
      const travelerRes = await query('SELECT first_name, last_name FROM users WHERE id = $1', [req.user.id]);
      if (guideUserRes.rows.length) {
        const g = guideUserRes.rows[0];
        const t = travelerRes.rows[0];
        email.sendNewBookingToGuide({
          to: g.email,
          guideName: `${g.first_name} ${g.last_name}`,
          travelerName: `${t.first_name} ${t.last_name}`,
          listingTitle: listing.title,
          bookingRef: booking.booking_ref,
          bookingDate: booking_date,
          persons: num_persons,
          totalAmount: booking.total_amount,
        }).catch(() => {});
      }
    } catch {}

    res.status(201).json(booking);
  } catch (error) {
    next(error);
  }
});

// GET /api/bookings - Get user's bookings
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let conditions = [];
    const params = [];
    let paramCount = 1;

    if (req.user.role === 'traveler') {
      conditions.push(`b.traveler_id = $${paramCount++}`);
      params.push(req.user.id);
    } else if (req.user.role === 'guide') {
      conditions.push(`b.guide_id = (SELECT id FROM guide_profiles WHERE user_id = $${paramCount++} LIMIT 1)`);
      params.push(req.user.id);
    }

    if (status) {
      conditions.push(`b.status = $${paramCount++}`);
      params.push(status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(`SELECT COUNT(*) FROM bookings b ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await query(`
      SELECT
        b.*,
        l.title as listing_title, l.cover_image, l.city, l.category,
        tu.first_name as traveler_first, tu.last_name as traveler_last, tu.avatar_url as traveler_avatar,
        gu.first_name as guide_first, gu.last_name as guide_last, gu.avatar_url as guide_avatar,
        r.id as review_id, r.rating as review_rating
      FROM bookings b
      JOIN listings l ON l.id = b.listing_id
      JOIN users tu ON tu.id = b.traveler_id
      JOIN guide_profiles gp ON gp.id = b.guide_id
      JOIN users gu ON gu.id = gp.user_id
      LEFT JOIN reviews r ON r.booking_id = b.id
      ${where}
      ORDER BY b.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `, params);

    res.json({
      bookings: result.rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/bookings/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT b.*,
        l.title as listing_title, l.cover_image, l.city, l.category, l.meeting_point,
        l.includes, l.cancellation_policy,
        tu.first_name as traveler_first, tu.last_name as traveler_last, tu.avatar_url as traveler_avatar,
        tu.phone as traveler_phone,
        gu.first_name as guide_first, gu.last_name as guide_last, gu.avatar_url as guide_avatar,
        gu.phone as guide_phone
      FROM bookings b
      JOIN listings l ON l.id = b.listing_id
      JOIN users tu ON tu.id = b.traveler_id
      JOIN guide_profiles gp ON gp.id = b.guide_id
      JOIN users gu ON gu.id = gp.user_id
      WHERE b.id = $1
    `, [req.params.id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Booking not found' });

    const booking = result.rows[0];

    const gpResult = req.user.role === 'guide'
      ? await query('SELECT id FROM guide_profiles WHERE user_id = $1', [req.user.id])
      : null;

    const isOwner = booking.traveler_id === req.user.id ||
                    (gpResult && booking.guide_id === gpResult.rows[0]?.id) ||
                    req.user.role === 'admin';

    if (!isOwner) return res.status(403).json({ error: 'Not authorized' });

    if (req.user.role !== 'admin' && booking.status !== 'confirmed' && booking.status !== 'completed') {
      delete booking.traveler_phone;
      delete booking.guide_phone;
    }

    res.json(booking);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/bookings/:id/status - Guide confirms/rejects/completes
router.patch('/:id/status',
  authenticate,
  requireRole('guide', 'admin'),
  sanitizeBody(['guide_notes']),
  validate([
    param('id').isUUID(),
    body('status').isIn(['confirmed', 'rejected', 'completed', 'cancelled'])
      .withMessage('status must be confirmed, rejected, completed, or cancelled'),
    body('guide_notes').optional().isString().isLength({ max: 1000 }),
  ]),
  async (req, res, next) => {
    try {
      const { status, guide_notes } = req.body;
      const validTransitions = { pending: ['confirmed', 'rejected'], confirmed: ['cancelled', 'completed', 'no_show'] };

      const bookingResult = await query(
        'SELECT b.*, gp.user_id as guide_user_id FROM bookings b JOIN guide_profiles gp ON gp.id = b.guide_id WHERE b.id = $1',
        [req.params.id]
      );
      if (!bookingResult.rows.length) return res.status(404).json({ error: 'Booking not found' });

      const booking = bookingResult.rows[0];

      if (req.user.role !== 'admin' && booking.guide_user_id !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const allowed = validTransitions[booking.status] || [];
      if (!allowed.includes(status)) {
        return res.status(400).json({ error: `Cannot transition from ${booking.status} to ${status}` });
      }

      const completedAt = status === 'completed' ? new Date() : null;
      const result = await query(
        `UPDATE bookings SET status = $1, guide_notes = $2, completed_at = $3, updated_at = NOW() WHERE id = $4 RETURNING *`,
        [status, guide_notes, completedAt, req.params.id]
      );

      // On completion: bump guide's total_bookings AND total_earnings.
      // total_earnings was previously declared but never updated.
      if (status === 'completed') {
        await query(
          `UPDATE guide_profiles
              SET total_bookings = total_bookings + 1,
                  total_earnings = total_earnings + $1
            WHERE id = $2`,
          [booking.guide_amount, booking.guide_id]
        );
      }

      // If a paid booking is being rejected or cancelled, refund the platform fee.
      const shouldRefund = (status === 'rejected' || status === 'cancelled') &&
                           booking.payment_status === 'paid' &&
                           booking.stripe_payment_intent_id;
      if (shouldRefund) {
        try {
          await stripe.refunds.create({
            payment_intent: booking.stripe_payment_intent_id,
            reason: 'requested_by_customer',
            metadata: { booking_id: booking.id, booking_ref: booking.booking_ref, refund_reason: status }
          });
          await query(`UPDATE bookings SET payment_status = 'refunded' WHERE id = $1`, [req.params.id]);
          console.log(`💸 Refunded booking ${booking.booking_ref} (${status})`);
        } catch (refundErr) {
          console.error(`Refund failed for booking ${booking.booking_ref}:`, refundErr.message);
        }
      }

      // Status emails (non-blocking)
      try {
        const travelerRes = await query('SELECT email, first_name, last_name FROM users WHERE id = $1', [booking.traveler_id]);
        const guideUserRes = await query(
          `SELECT u.first_name, u.last_name, u.phone FROM guide_profiles gp JOIN users u ON u.id = gp.user_id WHERE gp.id = $1`,
          [booking.guide_id]
        );
        const listingRes = await query('SELECT title, id FROM listings WHERE id = $1', [booking.listing_id]);
        const t = travelerRes.rows[0];
        const g = guideUserRes.rows[0];
        const l = listingRes.rows[0];

        if (status === 'confirmed' && t && g) {
          email.sendBookingAccepted({
            to: t.email,
            travelerName: `${t.first_name} ${t.last_name}`,
            guideName: `${g.first_name} ${g.last_name}`,
            listingTitle: l?.title,
            bookingDate: booking.booking_date,
            guidePhone: g.phone,
          }).catch(() => {});
        }

        if (status === 'rejected' && t && g) {
          email.sendBookingRejected({
            to: t.email,
            travelerName: `${t.first_name} ${t.last_name}`,
            guideName: `${g.first_name} ${g.last_name}`,
            listingTitle: l?.title,
            reason: guide_notes,
          }).catch(() => {});
        }

        if (status === 'completed' && t && l) {
          email.sendReviewPrompt({
            to: t.email,
            travelerName: `${t.first_name} ${t.last_name}`,
            guideName: g ? `${g.first_name} ${g.last_name}` : 'your guide',
            listingTitle: l.title,
            listingId: l.id,
          }).catch(() => {});
        }
      } catch {}

      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/bookings/:id/cancel - Traveler cancels
router.patch('/:id/cancel', authenticate, [
  body('reason').optional().trim().isLength({ max: 500 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { reason } = req.body;
    const result = await query(
      `UPDATE bookings
          SET status = 'cancelled',
              cancellation_reason = $1,
              cancelled_by = $2,
              cancelled_at = NOW(),
              updated_at = NOW()
        WHERE id = $3 AND traveler_id = $4 AND status IN ('pending','confirmed')
       RETURNING *`,
      [reason || null, req.user.role, req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Booking cannot be cancelled' });

    const booking = result.rows[0];

    if (booking.payment_status === 'paid' && booking.stripe_payment_intent_id) {
      try {
        await stripe.refunds.create({
          payment_intent: booking.stripe_payment_intent_id,
          reason: 'requested_by_customer',
          metadata: { booking_id: booking.id, booking_ref: booking.booking_ref, refund_reason: 'traveler_cancellation' },
        });
        await query(`UPDATE bookings SET payment_status = 'refunded' WHERE id = $1`, [booking.id]);
        booking.payment_status = 'refunded';
        console.log(`💸 Refunded booking ${booking.booking_ref} (traveler cancellation)`);
      } catch (refundErr) {
        console.error(`Refund failed for booking ${booking.booking_ref}:`, refundErr.message);
      }
    }

    res.json(booking);
  } catch (error) {
    next(error);
  }
});

// GET /:id/receipt — download a PDF receipt for a booking.
router.get('/:id/receipt', authenticate, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT b.*, l.title as listing_title, l.city,
             tu.email as traveler_email, tu.first_name as traveler_first, tu.last_name as traveler_last,
             gu.first_name as guide_first, gu.last_name as guide_last
        FROM bookings b
        JOIN listings l ON l.id = b.listing_id
        JOIN users tu ON tu.id = b.traveler_id
        JOIN guide_profiles gp ON gp.id = b.guide_id
        JOIN users gu ON gu.id = gp.user_id
       WHERE b.id = $1
    `, [req.params.id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Booking not found' });
    const booking = result.rows[0];

    const isTraveler = booking.traveler_id === req.user.id;
    const isGuide = await query(
      'SELECT 1 FROM guide_profiles WHERE id = $1 AND user_id = $2',
      [booking.guide_id, req.user.id]
    );
    const isAdmin = req.user.role === 'admin';
    if (!isTraveler && !isGuide.rows.length && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    streamReceipt(booking, res);
  } catch (err) { next(err); }
});

module.exports = router;
