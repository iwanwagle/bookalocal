const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const { query } = require('../config/database');
const { stripTags } = require('./sanitize');

// Pull bl_access from a Cookie header string. socket.io sends the browser's
// Cookie header through to handshake.headers when withCredentials is true.
const tokenFromCookie = (cookieHeader) => {
  if (!cookieHeader) return null;
  try {
    const parsed = cookie.parse(cookieHeader);
    return parsed.bl_access || null;
  } catch {
    return null;
  }
};

const setupSocketHandlers = (io) => {
  // Auth middleware for sockets — verify JWT and ensure user is still active.
  // Accepts the token from EITHER:
  //   - socket.handshake.auth.token  (legacy native clients)
  //   - the bl_access cookie         (preferred — browser default)
  io.use(async (socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      tokenFromCookie(socket.handshake.headers?.cookie);

    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userResult = await query(
        'SELECT id, role, is_active FROM users WHERE id = $1',
        [decoded.userId]
      );
      if (!userResult.rows.length || !userResult.rows[0].is_active) {
        return next(new Error('Account inactive'));
      }
      socket.userId = decoded.userId;
      socket.userRole = userResult.rows[0].role;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.userId}`);
    socket.join(`user:${socket.userId}`);

    socket.on('join_conversation', async (conversationId) => {
      if (typeof conversationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(conversationId)) return;
      const result = await query(
        'SELECT 1 FROM conversations WHERE id = $1 AND (traveler_id = $2 OR guide_id = $2) LIMIT 1',
        [conversationId, socket.userId]
      );
      if (result.rows.length) socket.join(`conversation:${conversationId}`);
    });

    socket.on('send_message', async ({ conversation_id, content }) => {
      try {
        if (typeof content !== 'string') return;
        const trimmed = content.trim();
        if (trimmed.length === 0) return;
        const sanitized = stripTags(trimmed);
        if (sanitized.length > 2000) {
          socket.emit('error', { message: 'Message too long (max 2000 chars)' });
          return;
        }
        if (typeof conversation_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(conversation_id)) return;

        const conv = await query(
          'SELECT * FROM conversations WHERE id = $1 AND (traveler_id = $2 OR guide_id = $2)',
          [conversation_id, socket.userId]
        );
        if (!conv.rows.length) return;

        const result = await query(
          'INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *',
          [conversation_id, socket.userId, sanitized]
        );

        await query('UPDATE conversations SET last_message_at = NOW() WHERE id = $1', [conversation_id]);

        const msgWithUser = await query(
          'SELECT m.*, u.first_name, u.last_name, u.avatar_url FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = $1',
          [result.rows[0].id]
        );

        io.to(`conversation:${conversation_id}`).emit('new_message', msgWithUser.rows[0]);

        const otherUserId = conv.rows[0].traveler_id === socket.userId
          ? conv.rows[0].guide_id
          : conv.rows[0].traveler_id;

        io.to(`user:${otherUserId}`).emit('conversation_update', {
          conversation_id,
          last_message: trimmed.slice(0, 200),
          timestamp: new Date(),
        });

      } catch (error) {
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('typing', async ({ conversation_id }) => {
      if (typeof conversation_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(conversation_id)) return;
      const result = await query(
        'SELECT 1 FROM conversations WHERE id = $1 AND (traveler_id = $2 OR guide_id = $2) LIMIT 1',
        [conversation_id, socket.userId]
      );
      if (!result.rows.length) return;
      socket.to(`conversation:${conversation_id}`).emit('user_typing', { user_id: socket.userId });
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.userId}`);
    });
  });
};

module.exports = { setupSocketHandlers };
