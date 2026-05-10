const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { query } = require('../config/database');
const { authenticate, requireRole, invalidateUserCache } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { sanitizeBody } = require('../utils/sanitize');

router.get('/', async (req, res, next) => {
  try {
    const { city, specialty, language, min_rating, page = 1, limit = 12 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = ["gp.profile_status = 'approved'"];
    const params = [];
    let p = 1;
    if (city) { conditions.push(`gp.city ILIKE $${p++}`); params.push(`%${city}%`); }
    if (specialty) { conditions.push(`$${p++} = ANY(gp.specialties)`); params.push(specialty); }
    if (language) { conditions.push(`$${p++} = ANY(gp.languages)`); params.push(language); }
    if (min_rating) { conditions.push(`gp.avg_rating >= $${p++}`); params.push(parseFloat(min_rating)); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(parseInt(limit), offset);
    const result = await query(`
      SELECT u.id, u.first_name, u.last_name, u.avatar_url,
             gp.id as guide_id, gp.bio, gp.languages, gp.specialties, gp.years_experience,
             gp.city, gp.country, gp.avg_rating, gp.total_reviews, gp.total_bookings,
             (SELECT COUNT(*) FROM listings l WHERE l.guide_id = gp.id AND l.status = 'approved') as listing_count
      FROM guide_profiles gp JOIN users u ON u.id = gp.user_id
      ${where} ORDER BY gp.avg_rating DESC LIMIT $${p} OFFSET $${p + 1}
    `, params);
    res.json({ guides: result.rows, total: result.rowCount });
  } catch (error) { next(error); }
});

router.get('/:id', validate([param('id').isUUID()]), async (req, res, next) => {
  try {
    // Only return public, non-sensitive guide profile fields.
    // Do NOT include id_number, kyc_*, bank_*, stripe_account_id, total_earnings.
    const result = await query(`
      SELECT
        u.id, u.first_name, u.last_name, u.avatar_url,
        u.created_at as member_since,
        gp.id as guide_id, gp.bio, gp.languages, gp.specialties, gp.years_experience,
        gp.location, gp.city, gp.country, gp.latitude, gp.longitude,
        gp.id_verified, gp.profile_status,
        gp.response_rate, gp.avg_rating, gp.total_reviews, gp.total_bookings,
        gp.created_at as profile_created_at, gp.updated_at as profile_updated_at
      FROM guide_profiles gp JOIN users u ON u.id = gp.user_id
      WHERE gp.id = $1 OR u.id = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Guide not found' });
    const guide = result.rows[0];
    const listings = await query(`SELECT * FROM listings WHERE guide_id = $1 AND status = 'approved' AND is_active = true`, [guide.guide_id || guide.id]);
    const reviews = await query(`
      SELECT r.*, u.first_name, u.last_name, u.avatar_url FROM reviews r JOIN users u ON u.id = r.traveler_id
      WHERE r.guide_id = $1 AND r.is_visible = true ORDER BY r.created_at DESC LIMIT 10
    `, [guide.guide_id || guide.id]);
    res.json({ guide: { ...guide, listings: listings.rows, reviews: reviews.rows } });
  } catch (error) { next(error); }
});

// POST /guides/kyc - Guide submits ID for verification
router.post('/kyc',
  authenticate,
  requireRole('guide'),
  validate([
    body('id_type').isIn(['passport', 'national_id', 'driving_license', 'citizenship']),
    body('id_number').isString().trim().isLength({ min: 4, max: 50 }),
    // public_ids reference Cloudinary objects in the private bookalocal/kyc folder.
    // We store these (not URLs) so we can mint fresh signed URLs when the admin reviews.
    body('id_front_public_id').isString().trim().matches(/^bookalocal\/kyc\//).isLength({ max: 256 }),
    body('id_back_public_id').optional().isString().trim().matches(/^bookalocal\/kyc\//).isLength({ max: 256 }),
  ]),
  async (req, res, next) => {
    try {
      const { id_type, id_number, id_front_public_id, id_back_public_id } = req.body;
      const result = await query(
        `UPDATE guide_profiles
            SET id_type = $1,
                id_number = $2,
                kyc_front_url = $3,
                kyc_back_url = $4,
                kyc_submitted_at = NOW(),
                id_verified = false
          WHERE user_id = $5
          RETURNING id`,
        [id_type, id_number, id_front_public_id, id_back_public_id || null, req.user.id]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Guide profile not found' });
      res.json({ message: 'KYC submitted for review' });
    } catch (error) { next(error); }
  }
);

router.put('/profile',
  authenticate,
  requireRole('guide'),
  sanitizeBody(['bio', 'location', 'city']),
  validate([
    body('bio').optional().isString().isLength({ max: 2000 })
      .withMessage('Bio must be a string under 2000 characters'),
    body('years_experience').optional().isInt({ min: 0, max: 80 })
      .withMessage('years_experience must be an integer between 0 and 80'),
    body('avatar_url').optional().isURL().isLength({ max: 2048 })
      .withMessage('avatar_url must be a valid URL under 2048 chars'),
    body('languages').optional().isArray({ max: 20 }),
    body('specialties').optional().isArray({ max: 20 }),
    body('city').optional().isString().isLength({ max: 100 }),
    body('location').optional().isString().isLength({ max: 200 }),
  ]),
  async (req, res, next) => {
  try {

    // avatar_url lives on the users table, not guide_profiles. Update it separately
    // so a profile-photo upload from the guide dashboard actually persists.
    if (req.body.avatar_url !== undefined) {
      await query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [req.body.avatar_url, req.user.id]);
      invalidateUserCache(req.user.id);
    }

    const profileFields = ['bio', 'languages', 'specialties', 'years_experience', 'location', 'city'];
    const updates = []; const values = []; let c = 1;
    profileFields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f} = $${c++}`); values.push(req.body[f]); } });

    // If only avatar_url was provided, the guide_profiles update is a no-op — return current data.
    if (!updates.length) {
      const current = await query('SELECT * FROM guide_profiles WHERE user_id = $1', [req.user.id]);
      return res.json(current.rows[0] || {});
    }

    values.push(req.user.id);
    const result = await query(`UPDATE guide_profiles SET ${updates.join(', ')}, updated_at = NOW() WHERE user_id = $${c} RETURNING *`, values);
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

module.exports = router;
