// chat.js route
const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { sanitizeBody } = require('../utils/sanitize');

router.get('/conversations', authenticate, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT c.*,
        tu.first_name as traveler_first, tu.last_name as traveler_last, tu.avatar_url as traveler_avatar,
        gu.first_name as guide_first, gu.last_name as guide_last, gu.avatar_url as guide_avatar,
        l.title as listing_title,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != $1 AND is_read = false) as unread_count
      FROM conversations c
      JOIN users tu ON tu.id = c.traveler_id JOIN users gu ON gu.id = c.guide_id
      LEFT JOIN listings l ON l.id = c.listing_id
      WHERE c.traveler_id = $1 OR c.guide_id = $1
      ORDER BY c.last_message_at DESC
    `, [req.user.id]);
    res.json({ conversations: result.rows });
  } catch (error) { next(error); }
});

router.get('/conversations/:id/messages',
  authenticate,
  validate([param('id').isUUID()]),
  async (req, res, next) => {
  try {
    const conv = await query('SELECT * FROM conversations WHERE id = $1 AND (traveler_id = $2 OR guide_id = $2)', [req.params.id, req.user.id]);
    if (!conv.rows.length) return res.status(403).json({ error: 'Not authorized' });
    const messages = await query(`
      SELECT m.*, u.first_name, u.last_name, u.avatar_url
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = $1 ORDER BY m.created_at ASC
    `, [req.params.id]);
    await query('UPDATE messages SET is_read = true WHERE conversation_id = $1 AND sender_id != $2', [req.params.id, req.user.id]);
    res.json({ messages: messages.rows });
  } catch (error) { next(error); }
});

router.post('/conversations',
  authenticate,
  sanitizeBody(['initial_message']),
  validate([
    body('guide_user_id').isUUID().withMessage('guide_user_id must be a valid UUID'),
    body('listing_id').isUUID().withMessage('listing_id must be a valid UUID'),
    body('initial_message').optional().isString().isLength({ max: 2000 })
      .withMessage('Initial message must be a string under 2000 chars'),
  ]),
  async (req, res, next) => {
  try {
    const { guide_user_id, listing_id, initial_message } = req.body;

    // Self-conversation guard (can't be expressed cleanly as a validator since it depends on req.user)
    if (guide_user_id === req.user.id) {
      return res.status(400).json({ error: 'Cannot start a conversation with yourself' });
    }

    // Validate the target user actually has role='guide' AND owns the given listing.
    // This prevents the conversation table from being polluted with arbitrary user pairs.
    const guideCheck = await query(
      `SELECT u.id FROM users u
       JOIN guide_profiles gp ON gp.user_id = u.id
       JOIN listings l ON l.guide_id = gp.id
       WHERE u.id = $1 AND u.role = 'guide' AND l.id = $2 AND l.is_active = true`,
      [guide_user_id, listing_id]
    );
    if (!guideCheck.rows.length) {
      return res.status(400).json({ error: 'Invalid guide or listing' });
    }

    // Atomic upsert using ON CONFLICT — relies on the UNIQUE(traveler_id, guide_id, listing_id) constraint.
    // Eliminates the race where two concurrent requests both see no row and both INSERT.
    const conv = await query(
      `INSERT INTO conversations (traveler_id, guide_id, listing_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (traveler_id, guide_id, listing_id) DO UPDATE SET last_message_at = conversations.last_message_at
       RETURNING *`,
      [req.user.id, guide_user_id, listing_id]
    );
    if (initial_message) {
      await query('INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3)', [conv.rows[0].id, req.user.id, initial_message]);
      await query('UPDATE conversations SET last_message_at = NOW() WHERE id = $1', [conv.rows[0].id]);
    }
    res.json(conv.rows[0]);
  } catch (error) { next(error); }
});

// GET /chat/unread-count - total unread messages for current user (used by navbar badge)
router.get('/unread-count', authenticate, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT COALESCE(SUM(
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != $1 AND m.is_read = false)
      ), 0) as total
      FROM conversations c WHERE c.traveler_id = $1 OR c.guide_id = $1`,
      [req.user.id]
    );
    res.json({ unread: parseInt(result.rows[0].total) });
  } catch (error) { next(error); }
});

module.exports = router;
