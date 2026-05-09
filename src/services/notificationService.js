/**
 * Enhanced Notification Service
 * Handles all notification creation, email sending, and real-time updates
 */
const pool = require('../db/pool');
const socketService = require('../socket/socketService');
const emailService = require('./emailService');

class NotificationService {
  constructor() {
    this.emailService = emailService;
  }

  /**
   * Create a user notification with optional email
   */
  async createUserNotification({
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
      // Check user notification settings
      const settings = await this.getUserNotificationSettings(userId);
      
      // Create in-app notification if enabled
      if (settings.in_app_enabled && this.shouldSendInApp(type, settings)) {
        const [result] = await pool.query(
          `INSERT INTO user_notifications (user_id, title, message, type, category, priority, related_id, related_type, metadata)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [userId, title, message, type, category, priority, relatedId ? String(relatedId) : null, relatedType, metadata ? JSON.stringify(metadata) : null]
        );

        const [[row]] = await pool.query('SELECT * FROM user_notifications WHERE id = ?', [result.insertId]);
        const notification = this.formatUserNotification(row);

        // Emit real-time notification
        socketService.emitUserNotification(userId, notification);

        // Send email if requested and enabled
        if (sendEmail && settings.email_enabled && this.shouldSendEmail(type, settings)) {
          await this.sendUserEmail(userId, { title, message, type, metadata });
        }

        return notification;
      }

      return null;
    } catch (error) {
      // Non-fatal — notification failure must never crash the calling route
      console.error('[NotificationService] Error creating user notification:', error.message);
      return null;
    }
  }

  /**
   * Create an admin notification with automatic email
   */
  async createAdminNotification({
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
      const [result] = await pool.query(
        `INSERT INTO admin_notifications (title, message, type, priority, related_id, related_type, user_id, metadata)
         VALUES (?,?,?,?,?,?,?,?)`,
        [title, message, type, priority, relatedId ? String(relatedId) : null, relatedType, userId, metadata ? JSON.stringify(metadata) : null]
      );

      const [[row]] = await pool.query('SELECT * FROM admin_notifications WHERE id = ?', [result.insertId]);
      const notification = this.formatAdminNotification(row);

      // Emit real-time notification to all admins
      socketService.emitAdminNotification(notification);

      // Send email to all admins with email enabled for this type
      await this.sendAdminEmails({ title, message, type, metadata, userId });

      return notification;
    } catch (error) {
      // Non-fatal — admin notification failure must never crash the calling route
      console.error('[NotificationService] Error creating admin notification:', error.message);
      return null;
    }
  }

  /**
   * Notification type handlers for specific events
   */
  async notifyDeposit(userId, depositData) {
    const { amount, currency, status, tx_id } = depositData;
    
    // User notification
    const userTitle = status === 'completed' ? 'Deposit Successful' : 'Deposit Pending';
    const userMessage = status === 'completed' 
      ? `Your deposit of ${currency} ${amount} has been successfully processed.`
      : `Your deposit of ${currency} ${amount} is being processed.`;

    await this.createUserNotification({
      userId,
      title: userTitle,
      message: userMessage,
      type: 'deposit',
      category: 'wallet',
      priority: 'medium',
      relatedId: tx_id,
      relatedType: 'deposit',
      metadata: depositData,
      sendEmail: true
    });

    // Admin notification
    if (status === 'completed') {
      await this.createAdminNotification({
        title: 'New User Deposit',
        message: `User has deposited ${currency} ${amount}`,
        type: 'user_deposit',
        priority: 'medium',
        relatedId: tx_id,
        relatedType: 'deposit',
        userId,
        metadata: depositData
      });
    }
  }

  async notifyWithdrawal(userId, withdrawalData) {
    const { amount, currency, status, tx_id } = withdrawalData;
    
    let userTitle, userMessage;
    switch (status) {
      case 'completed':
        userTitle = 'Withdrawal Successful';
        userMessage = `Your withdrawal of ${currency} ${amount} has been processed.`;
        break;
      case 'pending':
        userTitle = 'Withdrawal Pending';
        userMessage = `Your withdrawal of ${currency} ${amount} is being processed.`;
        break;
      case 'rejected':
        userTitle = 'Withdrawal Rejected';
        userMessage = `Your withdrawal of ${currency} ${amount} has been rejected.`;
        break;
    }

    await this.createUserNotification({
      userId,
      title: userTitle,
      message: userMessage,
      type: 'withdrawal',
      category: 'wallet',
      priority: status === 'rejected' ? 'high' : 'medium',
      relatedId: tx_id,
      relatedType: 'withdrawal',
      metadata: withdrawalData,
      sendEmail: true
    });

    // Admin notification
    await this.createAdminNotification({
      title: 'User Withdrawal Request',
      message: `User requested withdrawal of ${currency} ${amount} - Status: ${status}`,
      type: 'user_withdrawal',
      priority: 'medium',
      relatedId: tx_id,
      relatedType: 'withdrawal',
      userId,
      metadata: withdrawalData
    });
  }

  async notifyBotActivation(userId, botData) {
    await this.createUserNotification({
      userId,
      title: 'Bot Trading Activated',
      message: `Your ${botData.strategy} bot has been activated successfully.`,
      type: 'bot_activity',
      category: 'bot_activity',
      priority: 'medium',
      relatedId: userId,
      relatedType: 'bot_settings',
      metadata: botData
    });

    // User email
    this.emailService.sendBotActivationEmail(userId, botData)
      .catch(err => console.error('[Email Error] sendBotActivationEmail:', err.message));

    // Admin notification
    await this.createAdminNotification({
      title: 'Bot Trading Activated',
      message: `User activated bot trading with ${botData.strategy} strategy`,
      type: 'bot_activation',
      priority: 'medium',
      relatedId: userId,
      relatedType: 'bot_settings',
      userId,
      metadata: botData
    });
  }

  async notifyBotTrade(userId, tradeData, action) {
    const { pair, side, amount, entry_price, exit_price, pnl } = tradeData;
    
    if (action === 'opened') {
      await this.createUserNotification({
        userId,
        title: 'Position Opened',
        message: `Bot opened ${side} position for ${pair} at ${entry_price}`,
        type: 'bot_open',
        category: 'bot_activity',
        priority: 'medium',
        relatedId: tradeData.id,
        relatedType: 'bot_trade',
        metadata: tradeData
      });

      // User email
      this.emailService.sendBotPositionOpenedEmail(userId, tradeData)
        .catch(err => console.error('[Email Error] sendBotPositionOpenedEmail:', err.message));

      await this.createAdminNotification({
        title: 'Bot Position Opened',
        message: `User's bot opened ${side} position for ${pair}`,
        type: 'bot_position_open',
        priority: 'low',
        relatedId: tradeData.id,
        relatedType: 'bot_trade',
        userId,
        metadata: tradeData
      });
    } else if (action === 'closed') {
      const profitLoss = pnl >= 0 ? 'profit' : 'loss';
      const emoji = pnl >= 0 ? '💰' : '📉';
      
      await this.createUserNotification({
        userId,
        title: `Position Closed - ${profitLoss.toUpperCase()}`,
        message: `${emoji} Bot closed ${side} position for ${pair}. P&L: $${pnl}`,
        type: 'bot_close',
        category: 'bot_activity',
        priority: 'medium',
        relatedId: tradeData.id,
        relatedType: 'bot_trade',
        metadata: tradeData
      });

      // User email
      this.emailService.sendBotPositionClosedEmail(userId, tradeData)
        .catch(err => console.error('[Email Error] sendBotPositionClosedEmail:', err.message));

      await this.createAdminNotification({
        title: 'Bot Position Closed',
        message: `User's bot closed ${side} position for ${pair}. P&L: $${pnl}`,
        type: 'bot_position_close',
        priority: 'low',
        relatedId: tradeData.id,
        relatedType: 'bot_trade',
        userId,
        metadata: tradeData
      });
    }
  }

  async notifyPurchase(userId, purchaseData) {
    const { type, symbol, quantity, total_cost, status } = purchaseData;
    
    const assetType = type === 'stock' ? 'stocks' : 'crypto';
    const title = status === 'completed' ? `${assetType.toUpperCase()} Purchase Successful` : `${assetType.toUpperCase()} Purchase Pending`;
    const message = `You ${status === 'completed' ? 'purchased' : 'are purchasing'} ${quantity} ${symbol} for $${total_cost}`;

    await this.createUserNotification({
      userId,
      title,
      message,
      type: 'trade',
      category: 'trading',
      priority: 'medium',
      relatedId: purchaseData.tx_id,
      relatedType: 'purchase',
      metadata: purchaseData,
      sendEmail: true
    });

    // Admin notification
    if (status === 'completed') {
      await this.createAdminNotification({
        title: `User ${assetType.toUpperCase()} Purchase`,
        message: `User purchased ${quantity} ${symbol} for $${total_cost}`,
        type: type === 'stock' ? 'buy_stocks' : 'buy_crypto',
        priority: 'low',
        relatedId: purchaseData.tx_id,
        relatedType: 'purchase',
        userId,
        metadata: purchaseData
      });
    }
  }

  /**
   * Get user notification settings
   */
  async getUserNotificationSettings(userId) {
    try {
      const [[settings]] = await pool.query(
        'SELECT * FROM notification_settings WHERE user_id = ?',
        [userId]
      );
      
      if (!settings) {
        // Create default settings, then SELECT directly — never recurse,
        // so an INSERT failure (constraint violation, DB error) can't loop.
        await pool.query(
          'INSERT IGNORE INTO notification_settings (user_id) VALUES (?)',
          [userId]
        );
        const [[created]] = await pool.query(
          'SELECT * FROM notification_settings WHERE user_id = ?',
          [userId]
        );
        // If the row still doesn't exist (e.g. table missing), fall back to defaults
        return created ?? this.getDefaultUserSettings();
      }
      
      return settings;
    } catch (error) {
      console.error('[NotificationService] Error getting user settings:', error);
      return this.getDefaultUserSettings();
    }
  }

  /**
   * Check if should send in-app notification based on settings
   */
  shouldSendInApp(type, settings) {
    const mapping = {
      'deposit': settings.app_deposits,
      'withdrawal': settings.app_withdrawals,
      'trade': settings.app_trades,
      'order': settings.app_trades,
      'bot_open': settings.app_bot_activity,
      'bot_close': settings.app_bot_activity,
      'bot_activity': settings.app_bot_activity,
      'take_profit': settings.app_profit_loss,
      'stop_loss': settings.app_profit_loss,
      'profit_loss': settings.app_profit_loss,
      'security': settings.app_security,
      'system': settings.app_system,
      'price_alert': settings.app_price_alerts
    };
    
    return mapping[type] !== false;
  }

  /**
   * Check if should send email based on settings
   */
  shouldSendEmail(type, settings) {
    const mapping = {
      'deposit': settings.email_deposits,
      'withdrawal': settings.email_withdrawals,
      'trade': settings.email_trades,
      'order': settings.email_trades,
      'bot_open': settings.email_bot_activity,
      'bot_close': settings.email_bot_activity,
      'bot_activity': settings.email_bot_activity,
      'take_profit': settings.email_profit_loss,
      'stop_loss': settings.email_profit_loss,
      'profit_loss': settings.email_profit_loss,
      'security': settings.email_security,
      'system': settings.email_system
    };
    
    return mapping[type] !== false;
  }

  /**
   * Send email to user
   */
  async sendUserEmail(userId, notificationData) {
    try {
      const [[user]] = await pool.query('SELECT email, first_name FROM users WHERE id = ?', [userId]);
      if (!user) return;

      const template = this.getUserEmailTemplate(notificationData);
      
      await this.emailService.sendEmail({
        to: user.email,
        subject: template.subject,
        html: template.html
      });
    } catch (error) {
      console.error('[NotificationService] Error sending user email:', error);
    }
  }

  /**
   * Send emails to all admins — with safe fallback when admin_notification_settings row is missing
   */
  async sendAdminEmails(notificationData) {
    try {
      const [admins] = await pool.query(`
        SELECT u.email, u.first_name, ans.* 
        FROM users u 
        LEFT JOIN admin_notification_settings ans ON u.id = ans.admin_id 
        WHERE u.role = 'Admin'
      `);

      for (const admin of admins) {
        // Build effective settings — fall back to send-all defaults when no row exists
        const effectiveSettings = {
          email_enabled:      admin.email_enabled      ?? true,
          email_deposits:     admin.email_deposits     ?? true,
          email_withdrawals:  admin.email_withdrawals  ?? true,
          email_trades:       admin.email_trades       ?? true,
          email_bot_activity: admin.email_bot_activity ?? true,
          email_suspicious:   admin.email_suspicious   ?? true,
          email_failed_tx:    admin.email_failed_tx    ?? true,
          email_user_reg:     admin.email_user_reg     ?? true,
        };
        if (this.shouldSendAdminEmail(notificationData.type, effectiveSettings)) {
          const template = this.getAdminEmailTemplate(notificationData);
          await this.emailService.sendEmail({
            to: admin.email,
            subject: template.subject,
            html: template.html
          });
        }
      }
    } catch (error) {
      console.error('[NotificationService] Error sending admin emails:', error);
    }
  }

  /**
   * Check if should send admin email.
   * Falls back to all-enabled defaults when the admin has no settings row,
   * so a missing row never silently blocks all admin emails.
   */
  shouldSendAdminEmail(type, adminSettings) {
    const defaults = {
      email_enabled: true,
      email_deposits: true,
      email_withdrawals: true,
      email_trades: true,
      email_bot_activity: false,
      email_suspicious: true,
      email_failed_tx: true,
      email_user_reg: true,
    };
    // Merge: explicit DB values win; undefined fields fall back to defaults
    const s = { ...defaults, ...adminSettings };

    if (!s.email_enabled) return false;

    const mapping = {
      'user_deposit':        s.email_deposits,
      'user_withdrawal':     s.email_withdrawals,
      'buy_stocks':          s.email_trades,
      'buy_crypto':          s.email_trades,
      'bot_activation':      s.email_bot_activity,
      'bot_position_open':   s.email_bot_activity,
      'bot_position_close':  s.email_bot_activity,
      'suspicious_activity': s.email_suspicious,
      'failed_transaction':  s.email_failed_tx,
      'user_registration':   s.email_user_reg,
    };

    return mapping[type] !== false;
  }

  /**
   * Safely parse a JSON metadata string. Returns null on malformed input
   * instead of throwing and crashing the entire response.
   */
  parseMetadata(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      console.error('[NotificationService] Malformed metadata JSON, skipping:', raw?.slice?.(0, 80));
      return null;
    }
  }

  /**
   * Format notifications for API response
   */
  formatUserNotification(row) {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      message: row.message,
      type: row.type,
      category: row.category,
      priority: row.priority,
      isRead: !!row.is_read,
      relatedId: row.related_id,
      relatedType: row.related_type,
      metadata: this.parseMetadata(row.metadata),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  formatAdminNotification(row) {
    return {
      id: row.id,
      title: row.title,
      message: row.message,
      type: row.type,
      priority: row.priority,
      isRead: !!row.is_read,
      relatedId: row.related_id,
      relatedType: row.related_type,
      userId: row.user_id,
      metadata: this.parseMetadata(row.metadata),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Email templates
   */
  getUserEmailTemplate({ title, message, type, metadata }) {
    const baseTemplate = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: #0d0824; color: white; padding: 30px; border-radius: 10px;">
          <h1 style="margin: 0 0 20px 0; color: #4ade80;">${title}</h1>
          <p style="font-size: 16px; line-height: 1.6; margin: 0;">${message}</p>
        </div>
        <div style="text-align: center; margin-top: 20px; color: #666;">
          <p>Charles Schwab Trading Platform</p>
        </div>
      </div>
    `;

    return {
      subject: `Charles Schwab - ${title}`,
      html: baseTemplate
    };
  }

  getAdminEmailTemplate({ title, message, type, metadata, userId }) {
    const baseTemplate = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: #1a1040; color: white; padding: 30px; border-radius: 10px;">
          <h1 style="margin: 0 0 20px 0; color: #f59e0b;">Admin Alert: ${title}</h1>
          <p style="font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">${message}</p>
          ${userId ? `<p style="color: #a78bfa;">User ID: ${userId}</p>` : ''}
          ${metadata ? `<pre style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 5px; overflow-x: auto;">${JSON.stringify(metadata, null, 2)}</pre>` : ''}
        </div>
        <div style="text-align: center; margin-top: 20px; color: #666;">
          <p>Charles Schwab Admin Panel</p>
        </div>
      </div>
    `;

    return {
      subject: `Admin Alert - ${title}`,
      html: baseTemplate
    };
  }

  getDefaultUserSettings() {
    return {
      email_enabled: true,
      in_app_enabled: true,
      email_deposits: true,
      email_withdrawals: true,
      email_trades: true,
      email_bot_activity: true,
      email_profit_loss: true,
      email_security: true,
      email_system: false,
      app_deposits: true,
      app_withdrawals: true,
      app_trades: true,
      app_bot_activity: true,
      app_profit_loss: true,
      app_security: true,
      app_system: true,
      app_price_alerts: true
    };
  }
}

module.exports = new NotificationService();