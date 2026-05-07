/**
 * Utility: insert a user_notifications row and emit it via Socket.io.
 *
 * Usage:
 *   const notify = require('../utils/createUserNotification');
 *   await notify({ userId: 5, title: 'Deposit Received', message: '...', type: 'deposit' });
 */
const pool = require('../db/pool');
const socketService = require('../socket/socketService');

/**
 * @param {object} opts
 * @param {number}  opts.userId
 * @param {string}  opts.title
 * @param {string}  opts.message
 * @param {'deposit'|'withdrawal'|'trade'|'order'|'bot_open'|'bot_close'|'take_profit'|'stop_loss'|'system'|'security'} [opts.type]
 * @param {string|number|null} [opts.relatedId]
 * @param {string|null} [opts.relatedType]
 */
async function createUserNotification({
  userId,
  title,
  message,
  type = 'system',
  relatedId = null,
  relatedType = null,
}) {
  try {
    const [result] = await pool.query(
      `INSERT INTO user_notifications (user_id, title, message, type, related_id, related_type)
       VALUES (?,?,?,?,?,?)`,
      [userId, title, message, type, relatedId ? String(relatedId) : null, relatedType]
    );
    const [[row]] = await pool.query('SELECT * FROM user_notifications WHERE id = ?', [result.insertId]);
    const camel = {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      message: row.message,
      type: row.type,
      isRead: false,
      relatedId: row.related_id,
      relatedType: row.related_type,
      createdAt: row.created_at,
    };
    // Push real-time to the user's socket room
    socketService.emitUserNotification(userId, camel);
    return camel;
  } catch (err) {
    // Non-fatal — log but don't crash the request
    console.error('[user-notify] Failed to create user notification:', err.message);
    return null;
  }
}

module.exports = createUserNotification;
