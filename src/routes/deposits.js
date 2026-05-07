const express = require('express');
const { query, body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');
const createAdminNotification = require('../utils/createAdminNotification');
const createUserNotification = require('../utils/createUserNotification');

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

      // Admin notification for new deposit/withdrawal
      const [[user]] = await pool.query('SELECT first_name, last_name FROM users WHERE id = ?', [userId]);
      const userName = user ? `${user.first_name} ${user.last_name}` : `User #${userId}`;
      if (type === 'deposit') {
        createAdminNotification({
          title: 'New Deposit Request',
          message: `${userName} submitted a deposit of $${parseFloat(amount).toFixed(2)} via ${method}.`,
          type: 'deposit',
          relatedId: result.insertId,
          relatedType: 'deposit',
        });
        // User notification
        createUserNotification({
          userId,
          title: 'Deposit Request Submitted',
          message: `Your deposit of $${parseFloat(amount).toFixed(2)} via ${method} is pending review.`,
          type: 'deposit',
          relatedId: result.insertId,
          relatedType: 'deposit',
        });
      } else {
        createAdminNotification({
          title: 'New Withdrawal Request',
          message: `${userName} requested a withdrawal of $${parseFloat(amount).toFixed(2)} via ${method}.`,
          type: 'withdrawal',
          relatedId: result.insertId,
          relatedType: 'withdrawal',
        });
        // User notification
        createUserNotification({
          userId,
          title: 'Withdrawal Request Submitted',
          message: `Your withdrawal of $${parseFloat(amount).toFixed(2)} via ${method} is pending review.`,
          type: 'withdrawal',
          relatedId: result.insertId,
          relatedType: 'withdrawal',
        });
      }

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

      // Notify user of status change
      const amt = `$${parseFloat(deposit.amount).toFixed(2)}`;
      const method = deposit.method;
      if (status === 'completed') {
        createUserNotification({
          userId: deposit.user_id,
          title: deposit.type === 'deposit' ? 'Deposit Approved' : 'Withdrawal Approved',
          message: deposit.type === 'deposit'
            ? `Your deposit of ${amt} via ${method} has been approved and credited to your account.`
            : `Your withdrawal of ${amt} via ${method} has been approved and is being processed.`,
          type: deposit.type === 'deposit' ? 'deposit' : 'withdrawal',
          relatedId: req.params.id,
          relatedType: 'deposit',
        });
      } else if (status === 'rejected') {
        createUserNotification({
          userId: deposit.user_id,
          title: deposit.type === 'deposit' ? 'Deposit Rejected' : 'Withdrawal Rejected',
          message: deposit.type === 'deposit'
            ? `Your deposit of ${amt} via ${method} was rejected.${req.body.rejectionReason ? ' Reason: ' + req.body.rejectionReason : ''}`
            : `Your withdrawal of ${amt} via ${method} was rejected.${req.body.rejectionReason ? ' Reason: ' + req.body.rejectionReason : ''}`,
          type: deposit.type === 'deposit' ? 'deposit' : 'withdrawal',
          relatedId: req.params.id,
          relatedType: 'deposit',
        });
      }

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;

// ── DELETE /deposits/:id  (Admin only) ───────────────────────
router.delete(
  '/:id',
  requireAdmin,
  [param('id').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const [result] = await pool.query('DELETE FROM deposits WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Deposit not found' });
      res.json({ success: true, message: 'Deposit deleted' });
    } catch (err) {
      next(err);
    }
  }
);
