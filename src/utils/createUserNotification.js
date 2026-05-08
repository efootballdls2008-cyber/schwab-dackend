/**
 * Utility: create user notifications using the enhanced notification service
 * 
 * Usage:
 *   const notify = require('../utils/createUserNotification');
 *   await notify({ userId: 5, title: 'Deposit Received', message: '...', type: 'deposit' });
 */
const notificationService = require('../services/notificationService');

/**
 * @param {object} opts
 * @param {number}  opts.userId
 * @param {string}  opts.title
 * @param {string}  opts.message
 * @param {'deposit'|'withdrawal'|'trade'|'order'|'bot_open'|'bot_close'|'take_profit'|'stop_loss'|'system'|'security'|'price_alert'|'bot_activity'|'profit_loss'} [opts.type]
 * @param {'trading'|'wallet'|'bot_activity'|'profit_loss'|'system_alerts'} [opts.category]
 * @param {'low'|'medium'|'high'|'urgent'} [opts.priority]
 * @param {string|number|null} [opts.relatedId]
 * @param {string|null} [opts.relatedType]
 * @param {object|null} [opts.metadata]
 * @param {boolean} [opts.sendEmail]
 */
async function createUserNotification({
  userId,
  title,
  message,
  type = 'system',
  category = 'system_alerts',
  priority = 'medium',
  relatedId = null,
  relatedType = null,
  metadata = null,
  sendEmail = false
}) {
  try {
    return await notificationService.createUserNotification({
      userId,
      title,
      message,
      type,
      category,
      priority,
      relatedId,
      relatedType,
      metadata,
      sendEmail
    });
  } catch (err) {
    console.error('[createUserNotification] Failed to create user notification:', err.message);
    return null;
  }
}

module.exports = createUserNotification;
