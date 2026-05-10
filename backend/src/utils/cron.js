// Scheduled background jobs.
// Imported once from server.js — registers cron schedules with node-cron.
//
// Two jobs:
//   1. expireUnpaidBookings — every 5 min, cancel pending bookings with no payment > 30 min old
//   2. sendBookingReminders — daily at 09:00 UTC, email travelers about tomorrow's experience
//
// Both jobs swallow errors per-booking so one bad row doesn't stop the batch.

const cron = require('node-cron');
const { query } = require('../config/database');
const email = require('./emailQueue');

// ────────────────────────────────────────────────────────────────────
// Job 1: expire unpaid bookings older than 30 minutes
// ────────────────────────────────────────────────────────────────────
async function expireUnpaidBookings() {
  try {
    const result = await query(`
      UPDATE bookings
         SET status = 'cancelled',
             cancelled_at = NOW(),
             cancelled_by = 'system',
             cancellation_reason = 'Payment not completed within 30 minutes',
             updated_at = NOW()
       WHERE status = 'pending'
         AND payment_status != 'paid'
         AND created_at < NOW() - INTERVAL '30 minutes'
       RETURNING id, booking_ref
    `);
    if (result.rows.length) {
      console.log(`⏱  Auto-cancelled ${result.rows.length} unpaid booking(s):`,
        result.rows.map((r) => r.booking_ref).join(', '));
    }
  } catch (err) {
    console.error('expireUnpaidBookings error:', err.message);
  }
}

// ────────────────────────────────────────────────────────────────────
// Job 2: send 24-hour reminder emails
// ────────────────────────────────────────────────────────────────────
async function sendBookingReminders() {
  try {
    // Find all confirmed bookings whose date is exactly 1 day away.
    // We mark each one as reminded so we never double-send.
    const result = await query(`
      SELECT b.id, b.booking_ref, b.booking_date, b.start_time, b.num_persons,
             b.guide_amount, b.meeting_point, b.special_requests,
             l.title as listing_title, l.city,
             tu.email as traveler_email, tu.first_name as traveler_first, tu.last_name as traveler_last,
             gu.first_name as guide_first, gu.last_name as guide_last, gu.phone as guide_phone
        FROM bookings b
        JOIN listings l ON l.id = b.listing_id
        JOIN users tu ON tu.id = b.traveler_id
        JOIN guide_profiles gp ON gp.id = b.guide_id
        JOIN users gu ON gu.id = gp.user_id
       WHERE b.status = 'confirmed'
         AND b.payment_status = 'paid'
         AND b.booking_date = CURRENT_DATE + INTERVAL '1 day'
         AND b.reminder_sent_at IS NULL
    `);

    let sent = 0;
    for (const b of result.rows) {
      try {
        await email.sendBookingReminder({
          to: b.traveler_email,
          travelerName: `${b.traveler_first} ${b.traveler_last}`,
          guideName: `${b.guide_first} ${b.guide_last}`,
          guidePhone: b.guide_phone,
          listingTitle: b.listing_title,
          bookingRef: b.booking_ref,
          bookingDate: b.booking_date,
          startTime: b.start_time,
          city: b.city,
          meetingPoint: b.meeting_point,
          guideAmount: b.guide_amount,
          numPersons: b.num_persons,
        });
        await query('UPDATE bookings SET reminder_sent_at = NOW() WHERE id = $1', [b.id]);
        sent++;
      } catch (err) {
        console.error(`Reminder failed for ${b.booking_ref}:`, err.message);
      }
    }
    if (sent) console.log(`📨 Sent ${sent} 24h reminder email(s)`);
  } catch (err) {
    console.error('sendBookingReminders error:', err.message);
  }
}

// ────────────────────────────────────────────────────────────────────
// Registration
// ────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────
// Job 3: prune historical availability rows
// Without this, the availability table grows by 365 rows per active listing
// per year. Most queries only ever look at booking_date >= CURRENT_DATE so
// rows older than ~7 days are dead weight.
// ────────────────────────────────────────────────────────────────────
async function pruneOldAvailability() {
  try {
    const result = await query(`
      DELETE FROM availability
       WHERE date < CURRENT_DATE - INTERVAL '7 days'
    `);
    if (result.rowCount > 0) {
      console.log(`🧹 Pruned ${result.rowCount} historical availability row(s)`);
    }
  } catch (err) {
    console.error('pruneOldAvailability error:', err.message);
  }
}

function startCronJobs() {
  // Skip in test environment
  if (process.env.NODE_ENV === 'test') return;

  // Every 5 minutes — cleanup unpaid bookings
  cron.schedule('*/5 * * * *', expireUnpaidBookings);

  // Daily at 09:00 UTC — send tomorrow's reminders
  cron.schedule('0 9 * * *', sendBookingReminders);

  // Daily at 03:30 UTC — prune availability rows older than 7 days
  // Off-peak hours so it doesn't compete with user traffic
  cron.schedule('30 3 * * *', pruneOldAvailability);

  console.log('🗓  Cron jobs registered: expireUnpaidBookings (5min), sendBookingReminders (09:00 UTC), pruneOldAvailability (03:30 UTC)');
}

module.exports = {
  startCronJobs,
  expireUnpaidBookings,
  sendBookingReminders,
  pruneOldAvailability,
};
