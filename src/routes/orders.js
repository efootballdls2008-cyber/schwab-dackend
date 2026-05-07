const express = require('express');
const { query, body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── GET /orders?userId=:id&type=:type ────────────────────────
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
      let sql = 'SELECT * FROM orders WHERE user_id = ?';
      const params = [userId];
      if (req.query.type) {
        sql += ' AND type = ?';
        params.push(req.query.type);
      }
      sql += ' ORDER BY created_at DESC';
      const [rows] = await pool.query(sql, params);
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /orders ─────────────────────────────────────────────
router.post(
  '/',
  [
    body('userId').isInt({ min: 1 }),
    body('type').isIn(['buy', 'sell']).withMessage('type must be buy or sell'),
    body('coin').trim().notEmpty(),
    body('price').isFloat({ min: 0 }),
    body('amount').isFloat({ min: 0 }),
    body('total').isFloat({ min: 0 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { userId, type, coin, price, amount, total, status } = req.body;
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const [result] = await pool.query(
        'INSERT INTO orders (user_id, type, coin, price, amount, total, status) VALUES (?,?,?,?,?,?,?)',
        [userId, type, coin, price, amount, total, status || 'open']
      );
      const [[row]] = await pool.query('SELECT * FROM orders WHERE id = ?', [result.insertId]);
      res.status(201).json({ success: true, data: row });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /orders/:id ────────────────────────────────────────
router.patch(
  '/:id',
  [param('id').isInt({ min: 1 }), body('status').isIn(['open', 'filled', 'cancelled'])],
  validate,
  async (req, res, next) => {
    try {
      const [[order]] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
      if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
      if (req.user.role !== 'Admin' && req.user.id !== order.user_id) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      await pool.query('UPDATE orders SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
      const [[updated]] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
