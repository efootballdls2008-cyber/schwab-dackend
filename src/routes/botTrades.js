const express = require('express');
const { query, body, param } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── GET /botTrades?userId=:id ────────────────────────────────
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
        'SELECT * FROM bot_trades WHERE user_id = ? ORDER BY opened_at DESC',
        [userId]
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /botTrades/:id ───────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const [[row]] = await pool.query('SELECT * FROM bot_trades WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Bot trade not found' });
    if (req.user.role !== 'Admin' && req.user.id !== row.user_id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
});

// ── POST /botTrades ──────────────────────────────────────────
router.post(
  '/',
  [
    body('userId').isInt({ min: 1 }),
    body('pair').trim().notEmpty(),
    body('side').isIn(['buy', 'sell']),
    body('entryPrice').isFloat({ min: 0 }),
    body('amount').isFloat({ min: 0 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { userId, pair, side, entryPrice, exitPrice, amount, pnl, pnlPct,
              strategy, signal, openedAt, closedAt, status } = req.body;
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const id = `bot-${Date.now()}`;
      await pool.query(
        `INSERT INTO bot_trades (id, user_id, pair, side, entry_price, exit_price, amount,
          pnl, pnl_pct, strategy, signal, opened_at, closed_at, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, userId, pair, side, entryPrice, exitPrice || null, amount,
         pnl || 0, pnlPct || 0, strategy || null, signal || null,
         openedAt || new Date(), closedAt || null, status || 'open']
      );
      const [[row]] = await pool.query('SELECT * FROM bot_trades WHERE id = ?', [id]);
      res.status(201).json({ success: true, data: row });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /botTrades/:id ─────────────────────────────────────
router.patch('/:id', async (req, res, next) => {
  try {
    const [[trade]] = await pool.query('SELECT * FROM bot_trades WHERE id = ?', [req.params.id]);
    if (!trade) return res.status(404).json({ success: false, message: 'Bot trade not found' });
    if (req.user.role !== 'Admin' && req.user.id !== trade.user_id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const allowed = ['exit_price', 'pnl', 'pnl_pct', 'closed_at', 'status'];
    const fieldMap = { exitPrice: 'exit_price', pnlPct: 'pnl_pct', closedAt: 'closed_at' };
    const updates = {};
    for (const [k, v] of Object.entries(req.body)) {
      const col = fieldMap[k] || k;
      if (allowed.includes(col)) updates[col] = v;
    }
    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, message: 'No valid fields' });
    }
    const set = Object.keys(updates).map((k) => `\`${k}\` = ?`).join(', ');
    await pool.query(`UPDATE bot_trades SET ${set} WHERE id = ?`, [...Object.values(updates), req.params.id]);
    const [[updated]] = await pool.query('SELECT * FROM bot_trades WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
