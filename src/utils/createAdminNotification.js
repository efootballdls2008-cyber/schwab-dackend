/**
 * Utility: insert an admin_notification row and emit it via Socket.io.
 *
 * Usage:
 *   const notify = require('../utils/createAdminNotification');
 *   await notify({ title: 'New User', message: 'John Doe registered', type: 'user', relatedId: userId, relatedType: 'user' });
 */
const pool = require('../db/pool');
const socketService = require('../socket/socketService');

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {'info'|'success'|'warning'|'error'|'user'|'deposit'|'withdrawal'|'order'|'login'} [opts.type]
 * @param {string|number|null} [opts.relatedId]
 * @param {string|null} [opts.relatedType]
 */
async function createAdminNotification({ title, message, type = 'info', relatedId = null, relatedType = null }) {
  try {
    const [result] = await pool.query(
      `INSERT INTO admin_notifications (title, message, type, related_id, related_type) VALUES (?,?,?,?,?)`,
      [title, message, type, relatedId ? String(relatedId) : null, relatedType]
    );
    const [[row]] = await pool.query('SELECT * FROM admin_notifications WHERE id = ?', [result.insertId]);
    const camel = {
      id: row.id,
      title: row.title,
      message: row.message,
      type: row.type,
      isRead: false,
      relatedId: row.related_id,
      relatedType: row.related_type,
      createdAt: row.created_at,
    };
    socketService.emitAdminNotification(camel);
    return camel;
  } catch (err) {
    // Non-fatal — log but don't crash the request
    console.error('[notify] Failed to create admin notification:', err.message);
    return null;
  }
}

module.exports = createAdminNotification;
