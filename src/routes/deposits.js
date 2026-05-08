const express = require('express');
const { query, body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');
const notificationService = require('../services/notificationService');
const createUserNotification = require('../utils/createUserNotification');
const emailService = require('../services/emailService');

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
    body('txId').optional().trim(),
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

      // For withdrawals: reserve the amount immediately inside a transaction
      // to prevent double-spend if the user submits multiple requests concurrently.
      // The reserved amount is deducted now and refunded if the request is rejected.
      if (type === 'withdraw') {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          // Lock the user row so concurrent withdrawal submissions queue up
          const [[user]] = await conn.query('SELECT balance FROM users WHERE id = ? FOR UPDATE', [userId]);
          if (!user || user.balance < amount) {
            await conn.rollback();
            conn.release();
            return res.status(422).json({
              success: false,
              message: 'Insufficient balance for withdrawal',
            });
          }

          // Deduct immediately — this is the reservation
          await conn.query('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, userId]);

          const [result] = await conn.query(
            `INSERT INTO deposits (user_id, type, method, amount, currency, status, date, time, tx_id, note)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [userId, type, method, amount, currency || 'USD', 'pending',
             date || null, time || null, txId, note || null]
          );

          await conn.commit();
          conn.release();

          const [[row]] = await pool.query('SELECT * FROM deposits WHERE id = ?', [result.insertId]);

          await notificationService.notifyWithdrawal(userId, {
            amount: parseFloat(amount).toFixed(2),
            currency: currency || 'USD',
            status: 'pending',
            tx_id: txId,
            method,
            id: result.insertId,
          });

          return res.status(201).json({ success: true, data: row });
        } catch (err) {
          await conn.rollback();
          conn.release();
          throw err;
        }
      }

      const [result] = await pool.query(
        `INSERT INTO deposits (user_id, type, method, amount, currency, status, date, time, tx_id, note)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [userId, type, method, amount, currency || 'USD', status || 'pending',
         date || null, time || null, txId || null, note || null]
      );
      const [[row]] = await pool.query('SELECT * FROM deposits WHERE id = ?', [result.insertId]);

      // Deposit path only — withdrawal is handled above with balance reservation
      if (type === 'deposit') {
        await notificationService.notifyDeposit(userId, {
          amount: parseFloat(amount).toFixed(2),
          currency: currency || 'USD',
          status: status || 'pending',
          tx_id: txId,
          method,
          id: result.insertId,
        });
      }

      res.status(201).json({ success: true, data: row });
    } catch (error) {
      next(error);
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
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [[deposit]] = await connection.query('SELECT * FROM deposits WHERE id = ?', [req.params.id]);
      if (!deposit) {
        await connection.rollback();
        connection.release();
        return res.status(404).json({ success: false, message: 'Deposit not found' });
      }

      const { status, rejectionReason } = req.body;
      
      // Update deposit status
      await connection.query(
        'UPDATE deposits SET status = ?, rejection_reason = ? WHERE id = ?',
        [status, rejectionReason || null, req.params.id]
      );

      // Adjust user balance on approval/rejection
      if (deposit.status !== 'completed' && deposit.status !== 'rejected') {
        if (status === 'completed') {
          if (deposit.type === 'deposit') {
            // Deposits: credit the user now (balance was never touched at submission)
            await connection.query(
              'UPDATE users SET balance = balance + ? WHERE id = ?',
              [deposit.amount, deposit.user_id]
            );
          }
          // Withdrawals: balance was already reserved (deducted) at submission — nothing to do
        } else if (status === 'rejected') {
          if (deposit.type === 'withdraw') {
            // Refund the reserved amount back to the user
            await connection.query(
              'UPDATE users SET balance = balance + ? WHERE id = ?',
              [deposit.amount, deposit.user_id]
            );
          }
          // Deposits: nothing was credited at submission — nothing to refund
        }
      }

      await connection.commit();
      connection.release();

      const [[updated]] = await pool.query('SELECT * FROM deposits WHERE id = ?', [req.params.id]);

      // Notify user of status change (fire-and-forget with error handling)
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
          relatedId: parseInt(req.params.id),
          relatedType: 'deposit',
        }).catch(err => console.error('[Notification Error]', err));
        
        // Send email notification (fire-and-forget — errors must not block the response)
        if (deposit.type === 'deposit') {
          emailService.sendDepositNotification(deposit.user_id, deposit.amount, 'completed', method)
            .catch(emailErr => console.error('[Email Error]', emailErr));
        } else {
          emailService.sendWithdrawalNotification(deposit.user_id, deposit.amount, 'completed', method)
            .catch(emailErr => console.error('[Email Error]', emailErr));
        }
      } else if (status === 'rejected') {
        createUserNotification({
          userId: deposit.user_id,
          title: deposit.type === 'deposit' ? 'Deposit Rejected' : 'Withdrawal Rejected',
          message: deposit.type === 'deposit'
            ? `Your deposit of ${amt} via ${method} was rejected.${rejectionReason ? ' Reason: ' + rejectionReason : ''}`
            : `Your withdrawal of ${amt} via ${method} was rejected.${rejectionReason ? ' Reason: ' + rejectionReason : ''}`,
          type: deposit.type === 'deposit' ? 'deposit' : 'withdrawal',
          relatedId: parseInt(req.params.id),
          relatedType: 'deposit',
        }).catch(err => console.error('[Notification Error]', err));
        
        // Send email notification (fire-and-forget — errors must not block the response)
        if (deposit.type === 'deposit') {
          emailService.sendDepositNotification(deposit.user_id, deposit.amount, 'rejected', method, rejectionReason)
            .catch(emailErr => console.error('[Email Error]', emailErr));
        } else {
          emailService.sendWithdrawalNotification(deposit.user_id, deposit.amount, 'rejected', method, rejectionReason)
            .catch(emailErr => console.error('[Email Error]', emailErr));
        }
      }

      res.json({ success: true, data: updated });
    } catch (err) {
      await connection.rollback();
      connection.release();
      next(err);
    }
  }
);

// ── DELETE /deposits  (Admin only — delete ALL) ──────────────
router.delete('/', requireAdmin, async (req, res, next) => {
  if (req.body?.confirm !== true) {
    return res.status(400).json({
      success: false,
      message: 'Bulk delete requires { "confirm": true } in the request body.',
    });
  }
  try {
    await pool.query('DELETE FROM deposits');
    res.json({ success: true, message: 'All deposits deleted' });
  } catch (err) {
    next(err);
  }
});

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

module.exports = router;
