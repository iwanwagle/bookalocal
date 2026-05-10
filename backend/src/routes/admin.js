// admin.js
const express = require('express');
const router = express.Router();
const { body, param, query: vQuery } = require('express-validator');
const { query } = require('../config/database');
const { validate } = require('../middleware/validate');
const { authenticate, requireRole, invalidateUserCache } = require('../middleware/auth');
const email = require('../utils/emailQueue');

router.use(authenticate, requireRole('admin'));

// Helper: parse + clamp pagination params, return { page, limit, offset }.
const parsePagination = (req, defaultLimit = 20, maxLimit = 100) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
};

// Helper: standard paginated response.
const paginated = (rows, total, page, limit) => ({
  data: rows,
  pagination: {
    total: parseInt(total),
    page,
    limit,
    pages: Math.ceil(parseInt(total) / limit),
  },
});

router.get('/stats', async (req, res, next) => {
  try {
    const [travelers, guides, totalUsers, bookings30, totalBookings, revenue30, totalRevenue, pendingListings] = await Promise.all([
      query(`SELECT COUNT(*) FROM users WHERE role = 'traveler'`),
      query(`SELECT COUNT(*) FROM guide_profiles WHERE profile_status = 'approved'`),
      query(`SELECT COUNT(*) FROM users WHERE role != 'admin'`),
      query(`SELECT COUNT(*) FROM bookings WHERE created_at >= NOW() - INTERVAL '30 days'`),
      query(`SELECT COUNT(*) FROM bookings`),
      query(`SELECT COALESCE(SUM(platform_commission),0) as total FROM bookings WHERE payment_status = 'paid' AND created_at >= NOW() - INTERVAL '30 days'`),
      query(`SELECT COALESCE(SUM(platform_commission),0) as total FROM bookings WHERE payment_status = 'paid'`),
      query(`SELECT COUNT(*) FROM listings WHERE status = 'pending'`),
    ]);
    res.json({
      travelers: parseInt(travelers.rows[0].count),
      approved_guides: parseInt(guides.rows[0].count),
      total_users: parseInt(totalUsers.rows[0].count),
      bookings_30d: parseInt(bookings30.rows[0].count),
      total_bookings: parseInt(totalBookings.rows[0].count),
      revenue_30d: parseFloat(revenue30.rows[0].total),
      total_revenue: parseFloat(totalRevenue.rows[0].total),
      pending_listings: parseInt(pendingListings.rows[0].count),
    });
  } catch (error) { next(error); }
});

// GET /admin/listings/pending — paginated list of listings awaiting review.
router.get('/listings/pending',
  validate([
    vQuery('page').optional().isInt({ min: 1 }),
    vQuery('limit').optional().isInt({ min: 1, max: 100 }),
  ]),
  async (req, res, next) => {
    try {
      const { page, limit, offset } = parsePagination(req);
      const [countRes, rowsRes] = await Promise.all([
        query(`SELECT COUNT(*) FROM listings WHERE status = 'pending'`),
        query(
          `SELECT l.*, u.first_name, u.last_name, u.email
             FROM listings l
             JOIN guide_profiles gp ON gp.id = l.guide_id
             JOIN users u ON u.id = gp.user_id
            WHERE l.status = 'pending'
            ORDER BY l.created_at ASC
            LIMIT $1 OFFSET $2`,
          [limit, offset]
        ),
      ]);
      res.json(paginated(rowsRes.rows, countRes.rows[0].count, page, limit));
    } catch (e) { next(e); }
  }
);

router.patch('/listings/:id/approve',
  validate([
    param('id').isUUID(),
    body('notes').optional().isString().isLength({ max: 500 }),
  ]),
  async (req, res, next) => {
    try {
      const r = await query(`UPDATE listings SET status = 'approved', admin_notes = $1 WHERE id = $2 RETURNING *`, [req.body.notes, req.params.id]);
      try {
        const ge = await query(
          `SELECT u.email, u.first_name, u.last_name FROM listings l JOIN guide_profiles gp ON gp.id = l.guide_id JOIN users u ON u.id = gp.user_id WHERE l.id = $1`,
          [req.params.id]
        );
        if (ge.rows.length) {
          const g = ge.rows[0];
          email.sendListingApproved({ to: g.email, guideName: `${g.first_name} ${g.last_name}`, listingTitle: r.rows[0].title, listingId: r.rows[0].id }).catch(() => {});
        }
      } catch {}
      res.json(r.rows[0]);
    } catch (e) { next(e); }
  }
);

router.patch('/listings/:id/reject',
  validate([
    param('id').isUUID(),
    body('reason').optional().isString().isLength({ max: 500 }),
  ]),
  async (req, res, next) => {
    try {
      const r = await query(`UPDATE listings SET status = 'rejected', admin_notes = $1 WHERE id = $2 RETURNING *`, [req.body.reason, req.params.id]);
      try {
        const ge = await query(
          `SELECT u.email, u.first_name, u.last_name FROM listings l JOIN guide_profiles gp ON gp.id = l.guide_id JOIN users u ON u.id = gp.user_id WHERE l.id = $1`,
          [req.params.id]
        );
        if (ge.rows.length) {
          const g = ge.rows[0];
          email.sendListingRejected({ to: g.email, guideName: `${g.first_name} ${g.last_name}`, listingTitle: r.rows[0].title, reason: req.body.reason }).catch(() => {});
        }
      } catch {}
      res.json(r.rows[0]);
    } catch (e) { next(e); }
  }
);

router.get('/users',
  validate([
    vQuery('page').optional().isInt({ min: 1 }),
    vQuery('limit').optional().isInt({ min: 1, max: 100 }),
    vQuery('role').optional().isIn(['traveler', 'guide', 'admin']),
  ]),
  async (req, res, next) => {
    try {
      const { role: userRole, search } = req.query;
      const { page, limit, offset } = parsePagination(req);

      const conds = [];
      const params = [];
      let p = 1;
      if (userRole) { conds.push(`role = $${p++}`); params.push(userRole); }
      if (search) {
        conds.push(`(email ILIKE $${p} OR first_name ILIKE $${p} OR last_name ILIKE $${p})`);
        params.push(`%${search}%`);
        p++;
      }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

      const countResult = await query(`SELECT COUNT(*) FROM users ${where}`, params);
      const total = countResult.rows[0].count;

      params.push(limit, offset);
      const result = await query(
        `SELECT id, email, first_name, last_name, role, is_verified, is_active, created_at
           FROM users ${where}
          ORDER BY created_at DESC
          LIMIT $${p} OFFSET $${p + 1}`,
        params
      );
      res.json(paginated(result.rows, total, page, limit));
    } catch (e) { next(e); }
  }
);

router.patch('/users/:id/toggle-active',
  validate([param('id').isUUID()]),
  async (req, res, next) => {
    try {
      const r = await query('UPDATE users SET is_active = NOT is_active WHERE id = $1 RETURNING id, email, is_active', [req.params.id]);
      await invalidateUserCache(req.params.id);
      res.json(r.rows[0]);
    } catch (e) { next(e); }
  }
);

router.get('/bookings',
  validate([
    vQuery('page').optional().isInt({ min: 1 }),
    vQuery('limit').optional().isInt({ min: 1, max: 100 }),
    vQuery('status').optional().isIn(['pending', 'confirmed', 'completed', 'cancelled', 'rejected']),
  ]),
  async (req, res, next) => {
    try {
      const { status } = req.query;
      const { page, limit, offset } = parsePagination(req);

      const conds = [];
      const params = [];
      let p = 1;
      if (status) { conds.push(`b.status = $${p++}`); params.push(status); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

      const countResult = await query(`SELECT COUNT(*) FROM bookings b ${where}`, params);
      const total = countResult.rows[0].count;

      params.push(limit, offset);
      const result = await query(`
        SELECT b.*, l.title as listing_title,
               tu.first_name as t_first, tu.last_name as t_last,
               gu.first_name as g_first, gu.last_name as g_last
          FROM bookings b
          JOIN listings l ON l.id = b.listing_id
          JOIN users tu ON tu.id = b.traveler_id
          JOIN guide_profiles gp ON gp.id = b.guide_id
          JOIN users gu ON gu.id = gp.user_id
          ${where}
          ORDER BY b.created_at DESC
          LIMIT $${p} OFFSET $${p + 1}
      `, params);
      res.json(paginated(result.rows, total, page, limit));
    } catch (e) { next(e); }
  }
);

// GET /admin/kyc-pending — paginated list of guides awaiting KYC review.
// kyc_front_url / kyc_back_url contain Cloudinary public_ids (private folder),
// not public URLs. The frontend must call POST /uploads/sign-private-url.
router.get('/kyc-pending',
  validate([
    vQuery('page').optional().isInt({ min: 1 }),
    vQuery('limit').optional().isInt({ min: 1, max: 100 }),
  ]),
  async (req, res, next) => {
    try {
      const { page, limit, offset } = parsePagination(req);
      const [countRes, rowsRes] = await Promise.all([
        query(`
          SELECT COUNT(*)
            FROM guide_profiles gp
           WHERE gp.kyc_submitted_at IS NOT NULL
             AND gp.id_verified = false
             AND gp.id_number IS NOT NULL
        `),
        query(`
          SELECT gp.id, gp.id_type, gp.id_number,
                 gp.kyc_front_url AS kyc_front_public_id,
                 gp.kyc_back_url  AS kyc_back_public_id,
                 gp.kyc_submitted_at,
                 u.first_name, u.last_name, u.email
            FROM guide_profiles gp
            JOIN users u ON u.id = gp.user_id
           WHERE gp.kyc_submitted_at IS NOT NULL
             AND gp.id_verified = false
             AND gp.id_number IS NOT NULL
           ORDER BY gp.kyc_submitted_at ASC
           LIMIT $1 OFFSET $2
        `, [limit, offset]),
      ]);
      res.json(paginated(rowsRes.rows, countRes.rows[0].count, page, limit));
    } catch (e) { next(e); }
  }
);

router.patch('/kyc/:id/approve',
  validate([param('id').isUUID()]),
  async (req, res, next) => {
    try {
      await query("UPDATE guide_profiles SET id_verified = true WHERE id = $1", [req.params.id]);
      res.json({ message: 'KYC approved' });
    } catch (e) { next(e); }
  }
);

router.patch('/kyc/:id/reject',
  validate([param('id').isUUID()]),
  async (req, res, next) => {
    try {
      await query("UPDATE guide_profiles SET id_verified = false, id_number = NULL, kyc_submitted_at = NULL WHERE id = $1", [req.params.id]);
      res.json({ message: 'KYC rejected' });
    } catch (e) { next(e); }
  }
);

// GET /admin/analytics
router.get('/analytics',
  validate([vQuery('days').optional().isInt({ min: 1, max: 365 })]),
  async (req, res, next) => {
    try {
      const { days = 30 } = req.query;
      const n = Math.min(parseInt(days) || 30, 365);
      const cutoff = [n];
      const [daily, topListings, topGuides] = await Promise.all([
        query(`
          SELECT DATE_TRUNC('day', created_at) as day,
                 COUNT(*) as bookings,
                 COALESCE(SUM(platform_commission) FILTER (WHERE payment_status = 'paid'), 0) as revenue
            FROM bookings
           WHERE created_at >= NOW() - ($1 * interval '1 day')
           GROUP BY 1 ORDER BY 1
        `, cutoff),
        query(`
          SELECT l.title, l.id, COUNT(b.id) as bookings, COALESCE(SUM(b.platform_commission),0) as revenue
            FROM bookings b JOIN listings l ON l.id = b.listing_id
           WHERE b.created_at >= NOW() - ($1 * interval '1 day')
           GROUP BY l.id, l.title ORDER BY bookings DESC LIMIT 5
        `, cutoff),
        query(`
          SELECT u.first_name, u.last_name, COUNT(b.id) as bookings, COALESCE(SUM(b.platform_commission),0) as revenue
            FROM bookings b
            JOIN guide_profiles gp ON gp.id = b.guide_id
            JOIN users u ON u.id = gp.user_id
           WHERE b.created_at >= NOW() - ($1 * interval '1 day')
           GROUP BY u.id, u.first_name, u.last_name ORDER BY bookings DESC LIMIT 5
        `, cutoff),
      ]);
      res.json({ daily: daily.rows, topListings: topListings.rows, topGuides: topGuides.rows });
    } catch (e) { next(e); }
  }
);

module.exports = router;
