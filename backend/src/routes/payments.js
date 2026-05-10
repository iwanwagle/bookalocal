const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { query } = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { body } = require('express-validator');
const email = require('../utils/emailQueue');

// POST /api/payments/create-intent - Create Stripe PaymentIntent for 15% upfront
router.post('/create-intent',
  authenticate,
  requireRole('traveler'),
  validate([body('booking_id').isUUID().withMessage('booking_id must be a UUID')]),
  async (req, res, next) => {
  try {
    const { booking_id } = req.body;

    const bookingResult = await query(
      'SELECT b.*, l.title FROM bookings b JOIN listings l ON l.id = b.listing_id WHERE b.id = $1 AND b.traveler_id = $2',
      [booking_id, req.user.id]
    );
    if (!bookingResult.rows.length) return res.status(404).json({ error: 'Booking not found' });

    const booking = bookingResult.rows[0];
    if (booking.payment_status === 'paid') return res.status(400).json({ error: 'Already paid' });

    // Charge only 15% (platform commission)
    const amountInCents = Math.round(booking.platform_commission * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      metadata: {
        booking_id: booking.id,
        booking_ref: booking.booking_ref,
        traveler_id: req.user.id,
        listing_title: booking.title,
      },
      description: `Booking ${booking.booking_ref} - Platform fee (15%) for: ${booking.title}`,
      receipt_email: req.user.email,
    });

    // Update booking with payment intent
    await query(
      'UPDATE bookings SET stripe_payment_intent_id = $1 WHERE id = $2',
      [paymentIntent.id, booking_id]
    );

    res.json({
      client_secret: paymentIntent.client_secret,
      amount: booking.platform_commission,
      total_amount: booking.total_amount,
      guide_amount: booking.guide_amount,
      currency: 'USD',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/payments/webhook - Stripe webhook
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const bookingId = pi.metadata.booking_id;
        if (!bookingId) {
          console.warn('payment_intent.succeeded with no booking_id metadata — ignoring');
          break;
        }

        // Idempotency: Stripe retries webhooks for failed deliveries (up to 3 days).
        // Skip if this booking is already marked paid to avoid duplicate transactions/emails.
        const current = await query(
          'SELECT payment_status FROM bookings WHERE id = $1',
          [bookingId]
        );
        if (!current.rows.length) {
          console.warn(`Webhook received for unknown booking ${bookingId}`);
          break;
        }
        if (current.rows[0].payment_status === 'paid') {
          console.log(`Webhook replay for already-paid booking ${bookingId} — skipping`);
          break;
        }

        await query(
          `UPDATE bookings SET payment_status = 'paid', stripe_charge_id = $1, status = 'pending', updated_at = NOW() WHERE id = $2`,
          [pi.latest_charge, bookingId]
        );

        // Use ON CONFLICT to handle the rare case where transactions already has a row for this Stripe ID
        await query(
          `INSERT INTO transactions (booking_id, type, amount, stripe_id, status, description)
           VALUES ($1, 'charge', $2, $3, 'completed', 'Platform commission 15% upfront')
           ON CONFLICT (stripe_id) DO NOTHING`,
          [bookingId, pi.amount / 100, pi.id]
        );

        // Email booking confirmation to traveler
        try {
          const bookingDetails = await query(`
            SELECT b.*, l.title as listing_title,
              tu.email as traveler_email, tu.first_name as traveler_first, tu.last_name as traveler_last,
              gu.first_name as guide_first, gu.last_name as guide_last
            FROM bookings b
            JOIN listings l ON l.id = b.listing_id
            JOIN users tu ON tu.id = b.traveler_id
            JOIN guide_profiles gp ON gp.id = b.guide_id
            JOIN users gu ON gu.id = gp.user_id
            WHERE b.id = $1
          `, [bookingId]);

          if (bookingDetails.rows.length) {
            const bd = bookingDetails.rows[0];
            email.sendBookingConfirmed({
              to: bd.traveler_email,
              travelerName: `${bd.traveler_first} ${bd.traveler_last}`,
              bookingRef: bd.booking_ref,
              listingTitle: bd.listing_title,
              guideName: `${bd.guide_first} ${bd.guide_last}`,
              bookingDate: bd.booking_date ? new Date(bd.booking_date).toLocaleDateString('en-NP', { dateStyle: 'long' }) : '—',
              persons: bd.num_persons,
              platformFee: bd.platform_commission,
              guideAmount: bd.guide_amount,
              totalAmount: bd.total_amount,
            }).catch(() => {});
          }
        } catch {}

        console.log(`✅ Payment succeeded for booking ${bookingId}`);
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        await query(
          `UPDATE bookings SET payment_status = 'failed' WHERE id = $1`,
          [pi.metadata.booking_id]
        );
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        await query(
          `UPDATE bookings SET payment_status = 'refunded' WHERE stripe_charge_id = $1`,
          [charge.id]
        );
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// POST /api/payments/refund
router.post('/refund',
  authenticate,
  requireRole('admin'),
  validate([
    body('booking_id').isUUID(),
    body('amount').optional().isFloat({ min: 0.01 }),
    body('reason').optional().isString().isLength({ max: 500 }),
  ]),
  async (req, res, next) => {
  try {
    const { booking_id, reason } = req.body;
    
    const bookingResult = await query(
      'SELECT * FROM bookings WHERE id = $1 AND payment_status = $2',
      [booking_id, 'paid']
    );
    if (!bookingResult.rows.length) return res.status(400).json({ error: 'Booking not eligible for refund' });

    const booking = bookingResult.rows[0];
    
    const refund = await stripe.refunds.create({
      payment_intent: booking.stripe_payment_intent_id,
      reason: 'requested_by_customer',
      metadata: { booking_id, admin_reason: reason },
    });

    await query(
      `UPDATE bookings SET payment_status = 'refunded', status = 'cancelled', 
       cancellation_reason = $1, cancelled_by = 'admin' WHERE id = $2`,
      [reason, booking_id]
    );

    res.json({ refund_id: refund.id, status: refund.status });
  } catch (error) {
    next(error);
  }
});

// GET /api/payments/summary - Admin revenue summary
router.get('/summary', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { period = '30' } = req.query;
    
    // Clamp to integer and pass as bound parameter — never interpolate user input into SQL.
    const days = Math.min(Math.max(parseInt(period) || 30, 1), 365);
    const result = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE payment_status = 'paid') as paid_count,
        SUM(platform_commission) FILTER (WHERE payment_status = 'paid') as total_commission,
        SUM(total_amount) FILTER (WHERE payment_status = 'paid') as total_gmv,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        AVG(platform_commission) FILTER (WHERE payment_status = 'paid') as avg_commission
      FROM bookings
      WHERE created_at >= NOW() - ($1 * interval '1 day')
    `, [days]);

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
