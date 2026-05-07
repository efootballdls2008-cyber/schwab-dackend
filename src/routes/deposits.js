const express = require('express');
const { query, body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── GET /deposits  (Admin — all) ─────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    if (req.query.userId) {
      const userId = parseInt(req.query.userId);
      if (isNaN(userId)) {
        return res.status(422).json({ success: false, message: 'Invalid userId' });
      }
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const [rows] = await pool.query(
        'SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );
      return res.json({ success: true, data: rows });
    }

    // No userId — admin only
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const [rows] = await pool.query('SELECT * FROM deposits ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// ── POST /deposits ───────────────────────────────────────────
router.post(
  '/',
  [
    body('userId').isInt({ min: 1 }),
    body('type').isIn(['deposit', 'withdraw']),
    body('method').trim().notEmpty(),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
    body('txId').trim().notEmpty(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { userId, type, method, amount, currency, status, date, time, txId, note } = req.body;
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      // Check platform limits
      const [[settings]] = await pool.query('SELECT * FROM platform_settings LIMIT 1');
      if (settings) {
        if (type === 'deposit' && !settings.deposits_enabled) {
          return res.status(403).json({ success: false, message: 'Deposits are currently disabled' });
        }
        if (type === 'withdraw' && !settings.withdrawals_enabled) {
          return res.status(403).json({ success: false, message: 'Withdrawals are currently disabled' });
        }
        if (type === 'deposit' && amount < settings.min_deposit_amount) {
          return res.status(422).json({ success: false, message: `Minimum deposit is $${settings.min_deposit_amount}` });
        }
        if (type === 'deposit' && amount > settings.max_deposit_amount) {
          return res.status(422).json({ success: false, message: `Maximum deposit is $${settings.max_deposit_amount}` });
        }
        if (type === 'withdraw' && amount < settings.min_withdrawal_amount) {
          return res.status(422).json({ success: false, message: `Minimum withdrawal is $${settings.min_withdrawal_amount}` });
        }
        if (type === 'withdraw' && amount > settings.max_withdrawal_amount) {
          return res.status(422).json({ success: false, message: `Maximum withdrawal is $${settings.max_withdrawal_amount}` });
        }
      }

      const [result] = await pool.query(
        `INSERT INTO deposits (user_id, type, method, amount, currency, status, date, time, tx_id, note)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [userId, type, method, amount, currency || 'USD', status || 'pending',
         date || null, time || null, txId, note || null]
      );
      const [[row]] = await pool.query('SELECT * FROM deposits WHERE id = ?', [result.insertId]);
      res.status(201).json({ success: true, data: row });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /deposits/:id  (Admin — approve/reject) ────────────
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
      const [[deposit]] = await pool.query('SELECT * FROM deposits WHERE id = ?', [req.params.id]);
      if (!deposit) return res.status(404).json({ success: false, message: 'Deposit not found' });

      const { status, rejectionReason } = req.body;
      await pool.query(
        'UPDATE deposits SET status = ?, rejection_reason = ? WHERE id = ?',
        [status, rejectionReason || null, req.params.id]
      );

      // Adjust user balance on approval
      if (status === 'completed' && deposit.status !== 'completed') {
        const delta = deposit.type === 'deposit' ? deposit.amount : -deposit.amount;
        await pool.query('UPDATE users SET balance = balance + ? WHERE id = ?', [delta, deposit.user_id]);
      }

      const [[updated]] = await pool.query('SELECT * FROM deposits WHERE id = ?', [req.params.id]);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
