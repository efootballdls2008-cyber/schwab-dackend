const express = require('express');
const { query, body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── GET /tradeHistory?userId=:id ─────────────────────────────
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
      const [rows] = await pool.query(
        'SELECT * FROM trade_history WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /tradeHistory ───────────────────────────────────────
router.post(
  '/',
  [
    body('userId').isInt({ min: 1 }),
    body('tradeId').trim().notEmpty(),
    body('type').isIn(['Spot', 'Futures']),
    body('asset').trim().notEmpty(),
    body('assetSymbol').trim().notEmpty(),
    body('pair').trim().notEmpty(),
    body('side').isIn(['Buy', 'Sell']),
    body('amount').isFloat({ min: 0 }),
    body('amountUsd').isFloat({ min: 0 }),
    body('entryPrice').isFloat({ min: 0 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const {
        userId, tradeId, date, time, type, executedBy, asset, assetSymbol, assetColor,
        pair, side, amount, amountUsd, entryPrice, exitPrice, profitLoss, plPct, status,
      } = req.body;
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const [result] = await pool.query(
        `INSERT INTO trade_history
         (user_id, trade_id, date, time, type, executed_by, asset, asset_symbol, asset_color,
          pair, side, amount, amount_usd, entry_price, exit_price, profit_loss, pl_pct, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [userId, tradeId, date || null, time || null, type, executedBy || null,
         asset, assetSymbol, assetColor || null, pair, side, amount, amountUsd,
         entryPrice, exitPrice || null, profitLoss || null, plPct || null, status || 'pending']
      );
      const [[row]] = await pool.query('SELECT * FROM trade_history WHERE id = ?', [result.insertId]);
      res.status(201).json({ success: true, data: row });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
