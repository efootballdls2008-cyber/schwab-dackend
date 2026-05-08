/**
 * Utility: create admin notifications using the enhanced notification service
 *
 * Usage:
 *   const notify = require('../utils/createAdminNotification');
 *   await notify({ title: 'New User', message: 'John Doe registered', type: 'user_registration', userId: userId });
 *
 * NOTE: Errors are swallowed and logged — never re-thrown — so a notification
 * failure never crashes the calling request or background service.
 */
const notificationService = require('../services/notificationService');

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {'user_deposit'|'user_withdrawal'|'buy_stocks'|'buy_crypto'|'bot_activation'|'bot_position_open'|'bot_position_close'|'user_pnl'|'suspicious_activity'|'failed_transaction'|'system_alert'|'user_registration'} [opts.type]
 * @param {'low'|'medium'|'high'|'urgent'} [opts.priority]
 * @param {string|number|null} [opts.relatedId]
 * @param {string|null} [opts.relatedType]
 * @param {number|null} [opts.userId]
 * @param {object|null} [opts.metadata]
 */
async function createAdminNotification({
  title,
  message,
  type = 'system_alert',
  priority = 'medium',
  relatedId = null,
  relatedType = null,
  userId = null,
  metadata = null
}) {
  try {
    return await notificationService.createAdminNotification({
      title,
      message,
      type,
      priority,
      relatedId,
      relatedType,
      userId,
      metadata
    });
  } catch (error) {
    // Swallow — notification failures must never crash callers (routes or background services)
    console.error('[createAdminNotification] Failed to create admin notification:', error.message);
    return null;
  }
}

module.exports = createAdminNotification;
