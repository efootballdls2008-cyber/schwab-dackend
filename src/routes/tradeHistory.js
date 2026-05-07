const express = require('express');
const { query, body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');
const createUserNotification = require('../utils/createUserNotification');

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

      // Notify user of new trade
      const plStr = profitLoss != null
        ? ` · P&L: ${parseFloat(profitLoss) >= 0 ? '+' : ''}$${parseFloat(profitLoss).toFixed(2)}`
        : '';
      createUserNotification({
        userId,
        title: `Trade ${side} — ${pair}`,
        message: `${executedBy || 'Manual'} ${side} ${amount} ${assetSymbol} on ${pair} at $${parseFloat(entryPrice).toFixed(2)}${plStr}`,
        type: 'trade',
        relatedId: result.insertId,
        relatedType: 'trade_history',
      });

      res.status(201).json({ success: true, data: row });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;

// ── DELETE /tradeHistory/:id  (Admin only) ───────────────────
router.delete(
  '/:id',
  requireAdmin,
  [param('id').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const [result] = await pool.query('DELETE FROM trade_history WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Trade history not found' });
      res.json({ success: true, message: 'Trade history deleted' });
    } catch (err) {
      next(err);
    }
  }
);
