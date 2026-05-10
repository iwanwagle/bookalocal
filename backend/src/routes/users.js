// users.js
const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

router.put('/profile', authenticate, [
  body('first_name').optional().trim().isLength({ min: 1, max: 100 }),
  body('last_name').optional().trim().isLength({ min: 1, max: 100 }),
  body('phone').optional().trim().isLength({ min: 5, max: 20 }),
  body('avatar_url').optional().isURL().isLength({ max: 2048 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { first_name, last_name, phone, avatar_url } = req.body;
    const result = await query(
      `UPDATE users SET
         first_name = COALESCE($1, first_name),
         last_name  = COALESCE($2, last_name),
         phone      = COALESCE($3, phone),
         avatar_url = COALESCE($4, avatar_url),
         updated_at = NOW()
       WHERE id = $5
       RETURNING id, email, first_name, last_name, phone, avatar_url, role, created_at`,
      [first_name, last_name, phone, avatar_url, req.user.id]
    );
    invalidateUserCache(req.user.id);
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});

router.put('/password', authenticate, [
  body('current_password').notEmpty().withMessage('Current password is required'),
  body('new_password').isLength({ min: 8 }).matches(/^(?=.*[A-Za-z])(?=.*\d)/)
    .withMessage('New password must be at least 8 characters and include a letter and a number'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { current_password, new_password } = req.body;
    const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!userResult.rows.length || !userResult.rows[0].password_hash) {
      return res.status(400).json({ error: 'Cannot change password for this account' });
    }
    const valid = await bcrypt.compare(current_password, userResult.rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password incorrect' });
    const hash = await bcrypt.hash(new_password, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Password updated' });
  } catch (e) { next(e); }
});

// Wishlist
router.get('/wishlist', authenticate, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT l.*, u.first_name, u.last_name, gp.id as guide_id
      FROM wishlists w JOIN listings l ON l.id = w.listing_id
      JOIN guide_profiles gp ON gp.id = l.guide_id JOIN users u ON u.id = gp.user_id
      WHERE w.user_id = $1 AND l.status = 'approved' AND l.is_active = true
      ORDER BY w.created_at DESC
    `, [req.user.id]);
    res.json({ wishlist: result.rows });
  } catch (e) { next(e); }
});

router.post('/wishlist/:listing_id', authenticate, [
  param('listing_id').isUUID().withMessage('Invalid listing id'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    // Verify the listing exists and is publishable before allowing it onto the wishlist
    const listing = await query(
      `SELECT 1 FROM listings WHERE id = $1 AND status = 'approved' AND is_active = true`,
      [req.params.listing_id]
    );
    if (!listing.rows.length) return res.status(404).json({ error: 'Listing not found' });
    await query(
      'INSERT INTO wishlists (user_id, listing_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, req.params.listing_id]
    );
    res.json({ message: 'Added to wishlist' });
  } catch (e) { next(e); }
});

router.delete('/wishlist/:listing_id', authenticate, [
  param('listing_id').isUUID(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    await query('DELETE FROM wishlists WHERE user_id = $1 AND listing_id = $2', [req.user.id, req.params.listing_id]);
    res.json({ message: 'Removed from wishlist' });
  } catch (e) { next(e); }
});

module.exports = router;
