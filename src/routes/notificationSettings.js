/**
 * Notification Settings API Routes
 * Handles user and admin notification preferences
 */
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }
  next();
};

// ── User Notification Settings ────────────────────────────────

// GET /user/:userId - Get user notification settings
router.get('/user/:userId', 
  authenticate,
  [param('userId').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const userId = parseInt(req.params.userId);
      
      // Check permissions
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      let [[settings]] = await pool.query(
        'SELECT * FROM notification_settings WHERE user_id = ?',
        [userId]
      );

      // Create default settings if none exist
      if (!settings) {
        await pool.query(
          'INSERT INTO notification_settings (user_id) VALUES (?)',
          [userId]
        );
        [[settings]] = await pool.query(
          'SELECT * FROM notification_settings WHERE user_id = ?',
          [userId]
        );
      }

      res.json({ success: true, data: settings });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /user/:userId - Update user notification settings
router.put('/user/:userId',
  authenticate,
  [
    param('userId').isInt({ min: 1 }),
    body('email_enabled').optional().isBoolean(),
    body('in_app_enabled').optional().isBoolean(),
    body('email_deposits').optional().isBoolean(),
    body('email_withdrawals').optional().isBoolean(),
    body('email_trades').optional().isBoolean(),
    body('email_bot_activity').optional().isBoolean(),
    body('email_profit_loss').optional().isBoolean(),
    body('email_security').optional().isBoolean(),
    body('email_system').optional().isBoolean(),
    body('app_deposits').optional().isBoolean(),
    body('app_withdrawals').optional().isBoolean(),
    body('app_trades').optional().isBoolean(),
    body('app_bot_activity').optional().isBoolean(),
    body('app_profit_loss').optional().isBoolean(),
    body('app_security').optional().isBoolean(),
    body('app_system').optional().isBoolean(),
    body('app_price_alerts').optional().isBoolean()
  ],
  validate,
  async (req, res, next) => {
    try {
      const userId = parseInt(req.params.userId);
      
      // Check permissions
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const allowedFields = [
        'email_enabled', 'in_app_enabled',
        'email_deposits', 'email_withdrawals', 'email_trades', 'email_bot_activity',
        'email_profit_loss', 'email_security', 'email_system',
        'app_deposits', 'app_withdrawals', 'app_trades', 'app_bot_activity',
        'app_profit_loss', 'app_security', 'app_system', 'app_price_alerts'
      ];

      const updates = {};
      const values = [];
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updates[field] = '?';
          values.push(req.body[field]);
        }
      });

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, message: 'No valid fields to update' });
      }

      const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      values.push(userId);

      await pool.query(
        `UPDATE notification_settings SET ${setClause} WHERE user_id = ?`,
        values
      );

      // Return updated settings
      const [[settings]] = await pool.query(
        'SELECT * FROM notification_settings WHERE user_id = ?',
        [userId]
      );

      res.json({ success: true, data: settings });
    } catch (error) {
      next(error);
    }
  }
);

// ── Admin Notification Settings ───────────────────────────────

// GET /admin/:adminId - Get admin notification settings
router.get('/admin/:adminId',
  authenticate,
  requireAdmin,
  [param('adminId').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const adminId = parseInt(req.params.adminId);

      let [[settings]] = await pool.query(
        'SELECT * FROM admin_notification_settings WHERE admin_id = ?',
        [adminId]
      );

      // Create default settings if none exist
      if (!settings) {
        await pool.query(
          'INSERT INTO admin_notification_settings (admin_id) VALUES (?)',
          [adminId]
        );
        [[settings]] = await pool.query(
          'SELECT * FROM admin_notification_settings WHERE admin_id = ?',
          [adminId]
        );
      }

      res.json({ success: true, data: settings });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /admin/:adminId - Update admin notification settings
router.put('/admin/:adminId',
  authenticate,
  requireAdmin,
  [
    param('adminId').isInt({ min: 1 }),
    body('email_enabled').optional().isBoolean(),
    body('email_deposits').optional().isBoolean(),
    body('email_withdrawals').optional().isBoolean(),
    body('email_trades').optional().isBoolean(),
    body('email_bot_activity').optional().isBoolean(),
    body('email_suspicious').optional().isBoolean(),
    body('email_failed_tx').optional().isBoolean(),
    body('email_user_reg').optional().isBoolean()
  ],
  validate,
  async (req, res, next) => {
    try {
      const adminId = parseInt(req.params.adminId);

      const allowedFields = [
        'email_enabled', 'email_deposits', 'email_withdrawals', 'email_trades',
        'email_bot_activity', 'email_suspicious', 'email_failed_tx', 'email_user_reg'
      ];

      const updates = {};
      const values = [];
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updates[field] = '?';
          values.push(req.body[field]);
        }
      });

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, message: 'No valid fields to update' });
      }

      const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      values.push(adminId);

      await pool.query(
        `UPDATE admin_notification_settings SET ${setClause} WHERE admin_id = ?`,
        values
      );

      // Return updated settings
      const [[settings]] = await pool.query(
        'SELECT * FROM admin_notification_settings WHERE admin_id = ?',
        [adminId]
      );

      res.json({ success: true, data: settings });
    } catch (error) {
      next(error);
    }
  }
);

// ── Bulk Operations ───────────────────────────────────────────

// POST /user/:userId/reset - Reset user settings to defaults
router.post('/user/:userId/reset',
  authenticate,
  [param('userId').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const userId = parseInt(req.params.userId);
      
      // Check permissions
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      await pool.query('DELETE FROM notification_settings WHERE user_id = ?', [userId]);
      await pool.query('INSERT INTO notification_settings (user_id) VALUES (?)', [userId]);

      const [[settings]] = await pool.query(
        'SELECT * FROM notification_settings WHERE user_id = ?',
        [userId]
      );

      res.json({ success: true, data: settings, message: 'Settings reset to defaults' });
    } catch (error) {
      next(error);
    }
  }
);

// POST /admin/:adminId/reset - Reset admin settings to defaults
router.post('/admin/:adminId/reset',
  authenticate,
  requireAdmin,
  [param('adminId').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const adminId = parseInt(req.params.adminId);

      await pool.query('DELETE FROM admin_notification_settings WHERE admin_id = ?', [adminId]);
      await pool.query('INSERT INTO admin_notification_settings (admin_id) VALUES (?)', [adminId]);

      const [[settings]] = await pool.query(
        'SELECT * FROM admin_notification_settings WHERE admin_id = ?',
        [adminId]
      );

      res.json({ success: true, data: settings, message: 'Settings reset to defaults' });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;