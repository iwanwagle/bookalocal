const express = require('express');
const router = express.Router();
const { body, param, validationResult, query: vQuery } = require('express-validator');
const { query } = require('../config/database');
const { authenticate, requireRole, requireVerified, optionalAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { sanitizeBody } = require('../utils/sanitize');

// GET /api/listings - Search and filter listings
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const {
      city, category, pricing_type, min_price, max_price,
      min_rating, languages, date, persons = 1,
      sort = 'featured', page = 1, limit = 12,
      search
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = ["l.status = 'approved'", 'l.is_active = true'];
    const params = [];
    let paramCount = 1;

    if (city) {
      conditions.push(`l.city ILIKE $${paramCount++}`);
      params.push(`%${city}%`);
    }
    if (category) {
      conditions.push(`l.category = $${paramCount++}`);
      params.push(category);
    }
    if (pricing_type) {
      conditions.push(`l.pricing_type = $${paramCount++}`);
      params.push(pricing_type);
    }
    if (search) {
      // Use full-text search index if search_vector is available, fall back to ILIKE
      conditions.push(`(
        l.search_vector @@ plainto_tsquery('english', $${paramCount})
        OR l.title ILIKE $${paramCount + 1}
        OR l.city ILIKE $${paramCount + 1}
      )`);
      params.push(search);
      params.push(`%${search}%`);
      paramCount += 2;
    }
    if (min_rating) {
      conditions.push(`l.avg_rating >= $${paramCount++}`);
      params.push(parseFloat(min_rating));
    }
    if (min_price) {
      conditions.push(`COALESCE(l.price_per_hour, l.price_per_day, l.package_price) >= $${paramCount++}`);
      params.push(parseFloat(min_price));
    }
    if (max_price) {
      conditions.push(`COALESCE(l.price_per_hour, l.price_per_day, l.package_price) <= $${paramCount++}`);
      params.push(parseFloat(max_price));
    }

    const sortMap = {
      featured: 'l.is_featured DESC, l.avg_rating DESC',
      rating: 'l.avg_rating DESC',
      price_asc: 'COALESCE(l.price_per_hour, l.price_per_day, l.package_price) ASC',
      price_desc: 'COALESCE(l.price_per_hour, l.price_per_day, l.package_price) DESC',
      newest: 'l.created_at DESC',
      popular: 'l.total_bookings DESC',
    };

    // Build orderBy. If keyword search is active we'll need an extra param for ts_rank
    // — but we can't push it yet because it would leak into the COUNT query below.
    let orderBy;
    let rankParam = null;
    if (search) {
      rankParam = paramCount++; // reserve the next $N
      orderBy = `ts_rank(l.search_vector, plainto_tsquery('english', $${rankParam})) DESC, ${sortMap[sort] || sortMap.featured}`;
    } else {
      orderBy = sortMap[sort] || sortMap.featured;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // COUNT query uses only the WHERE filter params — no ranking, no LIMIT.
    const countResult = await query(`SELECT COUNT(*) FROM listings l ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);

    // Now push the rank param (if any) and pagination params for the SELECT.
    if (rankParam !== null) params.push(search);
    params.push(parseInt(limit), offset);
    const listingsResult = await query(`
      SELECT 
        l.id, l.title, l.slug, l.category, l.pricing_type,
        l.price_per_hour, l.price_per_day, l.package_price, l.package_duration_days,
        l.location, l.city, l.country, l.latitude, l.longitude,
        l.cover_image, l.images, l.tags, l.avg_rating, l.total_reviews, l.total_bookings,
        l.min_persons, l.max_persons, l.is_featured, l.languages,
        u.id as guide_user_id, u.first_name, u.last_name, u.avatar_url,
        gp.id as guide_id, gp.years_experience, gp.response_rate
      FROM listings l
      JOIN guide_profiles gp ON gp.id = l.guide_id
      JOIN users u ON u.id = gp.user_id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `, params);

    res.json({
      listings: listingsResult.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/listings/featured
router.get('/featured', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT l.*, u.first_name, u.last_name, u.avatar_url, gp.years_experience, gp.id as guide_id
      FROM listings l
      JOIN guide_profiles gp ON gp.id = l.guide_id
      JOIN users u ON u.id = gp.user_id
      WHERE l.status = 'approved' AND l.is_active = true AND l.is_featured = true
      ORDER BY l.avg_rating DESC
      LIMIT 6
    `);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/listings/:id - Single listing with full details.
// Public-facing: only `approved` listings are visible to the world.
// Owner / admin: can also fetch their own pending or rejected listings (so they
// can edit them in the guide dashboard).
router.get('/:id', optionalAuth, validate([param('id').isUUID()]), async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT 
        l.*,
        u.id as guide_user_id, u.first_name, u.last_name, u.avatar_url, u.created_at as guide_member_since,
        gp.id as guide_id, gp.bio, gp.languages, gp.specialties, gp.years_experience,
        gp.response_rate, gp.profile_status, gp.total_bookings as guide_total_bookings,
        gp.avg_rating as guide_avg_rating, gp.total_reviews as guide_total_reviews
      FROM listings l
      JOIN guide_profiles gp ON gp.id = l.guide_id
      JOIN users u ON u.id = gp.user_id
      WHERE (l.id = $1 OR l.slug = $1)
    `, [id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Listing not found' });

    const listing = result.rows[0];

    // Visibility check: non-approved listings only visible to owner or admin.
    const isOwner = req.user && req.user.id === listing.guide_user_id;
    const isAdmin = req.user?.role === 'admin';
    if (listing.status !== 'approved' && !isOwner && !isAdmin) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Increment view count only when the visitor is not the listing's own guide.
    // Doesn't address bot inflation (would need session/cookie tracking) but at least
    // prevents the guide refreshing their own page from inflating their stats.
    if (!req.user || req.user.id !== listing.guide_user_id) {
      await query('UPDATE listings SET view_count = view_count + 1 WHERE id = $1', [listing.id]);
    }

    // Get reviews
    const reviews = await query(`
      SELECT r.*, u.first_name, u.last_name, u.avatar_url
      FROM reviews r
      JOIN users u ON u.id = r.traveler_id
      WHERE r.listing_id = $1 AND r.is_visible = true
      ORDER BY r.created_at DESC
      LIMIT 10
    `, [listing.id]);

    // Check if wishlisted
    let is_wishlisted = false;
    if (req.user) {
      const wl = await query(
        'SELECT id FROM wishlists WHERE user_id = $1 AND listing_id = $2',
        [req.user.id, listing.id]
      );
      is_wishlisted = wl.rows.length > 0;
    }

    res.json({ ...listing, reviews: reviews.rows, is_wishlisted });
  } catch (error) {
    next(error);
  }
});

// POST /api/listings - Guide creates listing
router.post('/', authenticate, requireRole('guide'), requireVerified, sanitizeBody(['title', 'description', 'location', 'meeting_point', 'cancellation_policy', 'city']), [
  body('title').trim().isLength({ min: 10, max: 255 }),
  body('description').trim().isLength({ min: 50, max: 5000 }),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  body('category').isIn(['city_tour', 'hiking', 'cultural', 'photography', 'food_tour', 'adventure', 'wildlife', 'spiritual', 'other']),
  body('pricing_type').isIn(['hourly', 'daily', 'package']),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const guideResult = await query('SELECT id FROM guide_profiles WHERE user_id = $1', [req.user.id]);
    if (!guideResult.rows.length) return res.status(400).json({ error: 'Guide profile not found' });

    const guideId = guideResult.rows[0].id;
    const { title, description, category, pricing_type, price_per_hour, price_per_day,
            package_price, package_duration_days, min_persons, max_persons, duration_hours,
            location, city, country, latitude, longitude, languages, includes, excludes,
            meeting_point, cancellation_policy, images, cover_image, tags } = req.body;

    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();

    const result = await query(`
      INSERT INTO listings (
        guide_id, title, slug, description, category, pricing_type,
        price_per_hour, price_per_day, package_price, package_duration_days,
        min_persons, max_persons, duration_hours, location, city, country,
        latitude, longitude, languages, includes, excludes, meeting_point,
        cancellation_policy, images, cover_image, tags, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,'pending')
      RETURNING *
    `, [guideId, title, slug, description, category, pricing_type,
        price_per_hour, price_per_day, package_price, package_duration_days,
        min_persons || 1, max_persons || 10, duration_hours, location, city, country || 'Nepal',
        latitude, longitude, languages || [], includes || [], excludes || [],
        meeting_point, cancellation_policy, images || [], cover_image, tags || []]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /api/listings/:id - Guide updates listing
router.put('/:id', authenticate, requireRole('guide', 'admin'), sanitizeBody(['title', 'description', 'location', 'meeting_point', 'cancellation_policy', 'city']), [
  param('id').isUUID(),
  body('title').optional().trim().isLength({ min: 10, max: 255 }),
  body('description').optional().trim().isLength({ min: 50, max: 5000 }),
  body('category').optional().isIn(['city_tour', 'hiking', 'cultural', 'photography', 'food_tour', 'adventure', 'wildlife', 'spiritual', 'other']),
  body('pricing_type').optional().isIn(['hourly', 'daily', 'package']),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  body('price_per_hour').optional().isFloat({ min: 0 }),
  body('price_per_day').optional().isFloat({ min: 0 }),
  body('package_price').optional().isFloat({ min: 0 }),
  body('min_persons').optional().isInt({ min: 1, max: 100 }),
  body('max_persons').optional().isInt({ min: 1, max: 100 }),
  body('is_active').optional().isBoolean(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { id } = req.params;
    const guideResult = await query('SELECT id FROM guide_profiles WHERE user_id = $1', [req.user.id]);

    const existing = await query('SELECT * FROM listings WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Listing not found' });

    if (req.user.role !== 'admin' && existing.rows[0].guide_id !== guideResult.rows[0]?.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Allow-list of editable fields. is_active is editable but does NOT trigger re-review.
    const fields = ['title', 'description', 'category', 'pricing_type', 'price_per_hour', 'price_per_day',
      'package_price', 'package_duration_days', 'min_persons', 'max_persons', 'location', 'city',
      'latitude', 'longitude', 'languages', 'includes', 'excludes', 'meeting_point', 'cover_image',
      'images', 'tags', 'cancellation_policy'];
    // Whether any "content" field changed → forces re-review. Toggling is_active alone doesn't.
    const contentFields = new Set(['title', 'description', 'category', 'pricing_type', 'price_per_hour',
      'price_per_day', 'package_price', 'package_duration_days', 'min_persons', 'max_persons',
      'location', 'city', 'latitude', 'longitude', 'languages', 'includes', 'excludes',
      'meeting_point', 'cover_image', 'images', 'tags', 'cancellation_policy']);

    const updates = [];
    const values = [];
    let count = 1;
    let contentChanged = false;

    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${count++}`);
        values.push(req.body[field]);
        if (contentFields.has(field)) contentChanged = true;
      }
    });

    // is_active is allowed but doesn't count as a content edit
    if (req.body.is_active !== undefined) {
      updates.push(`is_active = $${count++}`);
      values.push(!!req.body.is_active);
    }

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    // Re-review only if content changed AND the actor is not an admin
    if (contentChanged && req.user.role !== 'admin') {
      updates.push(`status = 'pending'`);
    }

    values.push(id);
    const result = await query(
      `UPDATE listings SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${count} RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// GET /api/listings/:id/availability
router.get('/:id/availability', validate([param('id').isUUID()]), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid listing id' });

    const now = new Date();
    const month = Math.min(Math.max(parseInt(req.query.month) || (now.getMonth() + 1), 1), 12);
    const year = Math.min(Math.max(parseInt(req.query.year) || now.getFullYear(), 2020), 2100);

    const result = await query(
      `SELECT date, is_available, max_bookings, current_bookings
       FROM availability
       WHERE listing_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
       ORDER BY date`,
      [id, month, year]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// POST /api/listings/:id/availability - Guide sets availability
router.post('/:id/availability',
  authenticate,
  requireRole('guide'),
  validate([
    param('id').isUUID().withMessage('Invalid listing id'),
    body('dates').isArray({ min: 1, max: 366 })
      .withMessage('dates must be an array of 1–366 entries'),
    // Validate each slot — express-validator's wildcard syntax checks every item
    body('dates.*.date').matches(/^\d{4}-\d{2}-\d{2}$/)
      .withMessage('Each slot needs a valid date in YYYY-MM-DD format'),
    body('dates.*.start_time').optional().matches(/^\d{2}:\d{2}(:\d{2})?$/)
      .withMessage('start_time must be HH:MM or HH:MM:SS'),
    body('dates.*.is_available').optional().isBoolean()
      .withMessage('is_available must be true or false'),
  ]),
  async (req, res, next) => {
  try {
    const { id } = req.params;
    const { dates } = req.body;

    // Inline secondary check kept as defence in depth — express-validator handles all the format work
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const timeRe = /^\d{2}:\d{2}(:\d{2})?$/;
    for (const slot of dates) {
      if (!slot || typeof slot !== 'object' || !dateRe.test(slot.date)) {
        return res.status(400).json({ error: 'Each slot needs a valid date in YYYY-MM-DD format' });
      }
      if (slot.start_time && !timeRe.test(slot.start_time)) {
        return res.status(400).json({ error: 'start_time must be HH:MM or HH:MM:SS' });
      }
      if (slot.end_time && !timeRe.test(slot.end_time)) {
        return res.status(400).json({ error: 'end_time must be HH:MM or HH:MM:SS' });
      }
    }

    const guideResult = await query('SELECT id FROM guide_profiles WHERE user_id = $1', [req.user.id]);
    if (!guideResult.rows.length) return res.status(403).json({ error: 'Guide profile not found' });
    const listingCheck = await query('SELECT guide_id FROM listings WHERE id = $1', [id]);
    if (!listingCheck.rows.length || listingCheck.rows[0].guide_id !== guideResult.rows[0].id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Bulk upsert via UNNEST — one round-trip instead of N
    const listingIds = dates.map(() => id);
    const ds = dates.map(s => s.date);
    const starts = dates.map(s => s.start_time || null);
    const ends = dates.map(s => s.end_time || null);
    const flags = dates.map(s => s.is_available !== false);
    await query(`
      INSERT INTO availability (listing_id, date, start_time, end_time, is_available)
      SELECT * FROM UNNEST($1::uuid[], $2::date[], $3::time[], $4::time[], $5::bool[])
      ON CONFLICT (listing_id, date, start_time)
      DO UPDATE SET is_available = EXCLUDED.is_available, end_time = EXCLUDED.end_time
    `, [listingIds, ds, starts, ends, flags]);

    res.json({ message: 'Availability updated', count: dates.length });
  } catch (error) {
    next(error);
  }
});


// DELETE /api/listings/:id - Soft delete (sets is_active=false; preserves bookings/reviews)
router.delete('/:id', authenticate, requireRole('guide', 'admin'), validate([param('id').isUUID()]), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid listing id' });

    const guideResult = await query('SELECT id FROM guide_profiles WHERE user_id = $1', [req.user.id]);
    const existing = await query('SELECT guide_id FROM listings WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Listing not found' });

    if (req.user.role !== 'admin' && existing.rows[0].guide_id !== guideResult.rows[0]?.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Block deletion if there are upcoming bookings — guide must cancel them first
    const upcoming = await query(
      `SELECT COUNT(*) as c FROM bookings
       WHERE listing_id = $1 AND status IN ('pending', 'confirmed') AND booking_date >= CURRENT_DATE`,
      [id]
    );
    if (parseInt(upcoming.rows[0].c) > 0) {
      return res.status(409).json({ error: 'Cannot delete a listing with upcoming bookings. Cancel them first.' });
    }

    // Soft delete: keep the row so historical bookings/reviews still resolve
    await query('UPDATE listings SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);
    res.json({ message: 'Listing removed' });
  } catch (error) { next(error); }
});

module.exports = router;
