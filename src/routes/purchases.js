const express = require('express');
const { query, body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── GET /purchases  (with optional ?userId=) ─────────────────
router.get('/', async (req, res, next) => {
  try {
    if (req.query.userId) {
      const userId = parseInt(req.query.userId);
      if (isNaN(userId)) return res.status(422).json({ success: false, message: 'Invalid userId' });
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const [rows] = await pool.query(
        'SELECT * FROM purchases WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );
      return res.json({ success: true, data: rows });
    }
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const [rows] = await pool.query('SELECT * FROM purchases ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// ── POST /purchases ──────────────────────────────────────────
router.post(
  '/',
  [
    body('userId').isInt({ min: 1 }),
    body('type').trim().notEmpty(),
    body('symbol').trim().notEmpty(),
    body('name').trim().notEmpty(),
    body('quantity').isFloat({ min: 0 }),
    body('price').isFloat({ min: 0 }),
    body('totalCost').isFloat({ min: 0 }),
    body('txId').trim().notEmpty(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { userId, type, symbol, name, color, quantity, price, totalCost,
              date, time, txId, status } = req.body;
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const [result] = await pool.query(
        `INSERT INTO purchases (user_id, type, symbol, name, color, quantity, price, total_cost, date, time, tx_id, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [userId, type, symbol, name, color || null, quantity, price, totalCost,
         date || null, time || null, txId, status || 'pending']
      );
      const [[row]] = await pool.query('SELECT * FROM purchases WHERE id = ?', [result.insertId]);
      res.status(201).json({ success: true, data: row });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /purchases/:id  (Admin — approve/reject) ───────────
router.patch(
  '/:id',
  requireAdmin,
  [
    param('id').isInt({ min: 1 }),
    body('status').isIn(['pending', 'completed', 'rejected']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const [[purchase]] = await pool.query('SELECT * FROM purchases WHERE id = ?', [req.params.id]);
      if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found' });

      const { status, rejectionReason } = req.body;
      await pool.query(
        'UPDATE purchases SET status = ?, rejection_reason = ? WHERE id = ?',
        [status, rejectionReason || null, req.params.id]
      );

      // Deduct balance on approval
      if (status === 'completed' && purchase.status !== 'completed') {
        await pool.query(
          'UPDATE users SET balance = balance - ? WHERE id = ?',
          [purchase.total_cost, purchase.user_id]
        );
      }

      const [[updated]] = await pool.query('SELECT * FROM purchases WHERE id = ?', [req.params.id]);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
