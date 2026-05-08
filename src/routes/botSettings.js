const express = require('express');
const { query, body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { buildUpdate, BOT_SETTINGS_WHITELIST, BOT_SETTINGS_FIELD_MAP } = require('../utils/buildUpdate');

const router = express.Router();
router.use(authenticate);

// ── GET /botSettings?userId=:id ──────────────────────────────
router.get(
  '/',
  [query('userId').isInt({ min: 1 }).withMessage('userId required')],
  validate,
  async (req, res, next) => {
    try {
      const userId = parseInt(req.query.userId);
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const [rows] = await pool.query('SELECT * FROM bot_settings WHERE user_id = ?', [userId]);
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /botSettings/:id ─────────────────────────────────────
router.get(
  '/:id',
  [param('id').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const [[row]] = await pool.query('SELECT * FROM bot_settings WHERE id = ?', [req.params.id]);
      if (!row) return res.status(404).json({ success: false, message: 'Bot settings not found' });
      if (req.user.role !== 'Admin' && req.user.id !== row.user_id) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      res.json({ success: true, data: row });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /botSettings/:id ───────────────────────────────────
router.patch(
  '/:id',
  [
    param('id').isInt({ min: 1 }),
    body('running').optional().isBoolean(),
    body('strategy').optional().trim().notEmpty(),
    body('riskLevel').optional().trim().notEmpty(),
    body('pair').optional().trim().notEmpty(),
    body('timeframe').optional().trim().notEmpty(),
    body('takeProfit').optional().isFloat({ min: 0 }),
    body('stopLoss').optional().isFloat({ min: 0 }),
    body('trailingStop').optional().isFloat({ min: 0 }),
    body('autoReinvest').optional().isBoolean(),
    body('maxOpenTrades').optional().isInt({ min: 1 }),
    body('dailyProfitTarget').optional().isFloat({ min: 0 }),
    body('confidenceThreshold').optional().isFloat({ min: 0, max: 100 }),
    body('tradeDurationSeconds').optional().isInt({ min: 10 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const [[settings]] = await pool.query('SELECT * FROM bot_settings WHERE id = ?', [req.params.id]);
      if (!settings) return res.status(404).json({ success: false, message: 'Bot settings not found' });
      if (req.user.role !== 'Admin' && req.user.id !== settings.user_id) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const result = buildUpdate(req.body, BOT_SETTINGS_WHITELIST, BOT_SETTINGS_FIELD_MAP);
      if (!result) {
        return res.status(400).json({ success: false, message: 'No valid fields' });
      }
      const { setClauses: set, values } = result;
      await pool.query(`UPDATE bot_settings SET ${set} WHERE id = ?`, [...values, req.params.id]);
      const [[updated]] = await pool.query('SELECT * FROM bot_settings WHERE id = ?', [req.params.id]);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
