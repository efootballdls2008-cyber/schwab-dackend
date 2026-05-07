const express = require('express');
const { query, body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── GET /holdings  (with optional ?userId=) ──────────────────
router.get('/', async (req, res, next) => {
  try {
    if (req.query.userId) {
      const userId = parseInt(req.query.userId);
      if (isNaN(userId)) return res.status(422).json({ success: false, message: 'Invalid userId' });
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const [rows] = await pool.query('SELECT * FROM holdings WHERE user_id = ?', [userId]);
      return res.json({ success: true, data: rows });
    }
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const [rows] = await pool.query('SELECT * FROM holdings ORDER BY user_id');
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /holdings/:id ────────────────────────────────────────
router.get(
  '/:id',
  [param('id').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const [[row]] = await pool.query('SELECT * FROM holdings WHERE id = ?', [req.params.id]);
      if (!row) return res.status(404).json({ success: false, message: 'Holding not found' });
      if (req.user.role !== 'Admin' && req.user.id !== row.user_id) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      res.json({ success: true, data: row });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /holdings ───────────────────────────────────────────
router.post(
  '/',
  [
    body('userId').isInt({ min: 1 }),
    body('type').isIn(['stock', 'crypto']),
    body('symbol').trim().notEmpty(),
    body('name').trim().notEmpty(),
    body('quantity').isFloat({ min: 0 }),
    body('avgBuyPrice').isFloat({ min: 0 }),
    body('currentPrice').isFloat({ min: 0 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { userId, type, symbol, name, color, quantity, avgBuyPrice, currentPrice } = req.body;
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const [result] = await pool.query(
        `INSERT INTO holdings (user_id, type, symbol, name, color, quantity, avg_buy_price, current_price)
         VALUES (?,?,?,?,?,?,?,?)`,
        [userId, type, symbol, name, color || null, quantity, avgBuyPrice, currentPrice]
      );
      const [[row]] = await pool.query('SELECT * FROM holdings WHERE id = ?', [result.insertId]);
      res.status(201).json({ success: true, data: row });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /holdings/:id ──────────────────────────────────────
router.patch(
  '/:id',
  [
    param('id').isInt({ min: 1 }),
    body('quantity').optional().isFloat({ min: 0 }),
    body('avgBuyPrice').optional().isFloat({ min: 0 }),
    body('currentPrice').optional().isFloat({ min: 0 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const [[holding]] = await pool.query('SELECT * FROM holdings WHERE id = ?', [req.params.id]);
      if (!holding) return res.status(404).json({ success: false, message: 'Holding not found' });
      if (req.user.role !== 'Admin' && req.user.id !== holding.user_id) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const fieldMap = { avgBuyPrice: 'avg_buy_price', currentPrice: 'current_price' };
      const allowed = ['quantity', 'avg_buy_price', 'current_price', 'color'];
      const updates = {};
      for (const [k, v] of Object.entries(req.body)) {
        const col = fieldMap[k] || k;
        if (allowed.includes(col)) updates[col] = v;
      }
      if (!Object.keys(updates).length) {
        return res.status(400).json({ success: false, message: 'No valid fields' });
      }
      const set = Object.keys(updates).map((k) => `\`${k}\` = ?`).join(', ');
      await pool.query(`UPDATE holdings SET ${set} WHERE id = ?`, [...Object.values(updates), req.params.id]);
      const [[updated]] = await pool.query('SELECT * FROM holdings WHERE id = ?', [req.params.id]);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;

// ── DELETE /holdings/:id  (Admin only) ───────────────────────
router.delete(
  '/:id',
  requireAdmin,
  [param('id').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const [result] = await pool.query('DELETE FROM holdings WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Holding not found' });
      res.json({ success: true, message: 'Holding deleted' });
    } catch (err) {
      next(err);
    }
  }
);
