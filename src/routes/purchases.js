const express = require('express');
const { query, body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');
const createAdminNotification = require('../utils/createAdminNotification');
const createUserNotification = require('../utils/createUserNotification');

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

      // Admin notification for new buy order
      const [[user]] = await pool.query('SELECT first_name, last_name FROM users WHERE id = ?', [userId]);
      const userName = user ? `${user.first_name} ${user.last_name}` : `User #${userId}`;
      createAdminNotification({
        title: 'New Buy Order',
        message: `${userName} placed a buy order for ${quantity} ${symbol} (${name}) at $${parseFloat(price).toFixed(2)} each.`,
        type: type === 'buy_crypto' ? 'buy_crypto' : 'buy_stocks',
        relatedId: result.insertId,
        relatedType: 'purchase',
      }).catch(err => console.error('[Notification Error]', err));
      // User notification
      createUserNotification({
        userId,
        title: 'Buy Order Submitted',
        message: `Your order to buy ${quantity} ${symbol} at $${parseFloat(price).toFixed(2)} is pending.`,
        type: 'order',
        relatedId: result.insertId,
        relatedType: 'purchase',
      }).catch(err => console.error('[Notification Error]', err));

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
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          // Lock the user row to prevent concurrent double-approvals
          const [[user]] = await conn.query('SELECT balance FROM users WHERE id = ? FOR UPDATE', [purchase.user_id]);
          if (!user || parseFloat(user.balance) < parseFloat(purchase.total_cost)) {
            await conn.rollback();
            conn.release();
            return res.status(422).json({ success: false, message: 'Insufficient balance to complete this purchase' });
          }
          await conn.query('UPDATE users SET balance = balance - ? WHERE id = ?', [purchase.total_cost, purchase.user_id]);
          await conn.commit();
          conn.release();
        } catch (err) {
          await conn.rollback();
          conn.release();
          throw err;
        }
      }

      const [[updated]] = await pool.query('SELECT * FROM purchases WHERE id = ?', [req.params.id]);

      // Notify user of order status change
      if (status === 'completed') {
        createUserNotification({
          userId: purchase.user_id,
          title: 'Buy Order Filled',
          message: `Your order for ${purchase.quantity} ${purchase.symbol} at $${parseFloat(purchase.price).toFixed(2)} has been filled.`,
          type: 'order',
          relatedId: req.params.id,
          relatedType: 'purchase',
        }).catch(err => console.error('[Notification Error]', err));
      } else if (status === 'rejected') {
        createUserNotification({
          userId: purchase.user_id,
          title: 'Buy Order Rejected',
          message: `Your order for ${purchase.quantity} ${purchase.symbol} was rejected.${req.body.rejectionReason ? ' Reason: ' + req.body.rejectionReason : ''}`,
          type: 'order',
          relatedId: req.params.id,
          relatedType: 'purchase',
        }).catch(err => console.error('[Notification Error]', err));
      }

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /purchases  (Admin only — delete ALL) ─────────────
router.delete('/', requireAdmin, async (req, res, next) => {
  if (req.body?.confirm !== true) {
    return res.status(400).json({
      success: false,
      message: 'Bulk delete requires { "confirm": true } in the request body.',
    });
  }
  try {
    await pool.query('DELETE FROM purchases');
    res.json({ success: true, message: 'All purchases deleted' });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /purchases/:id  (Admin only) ──────────────────────
router.delete(
  '/:id',
  requireAdmin,
  [param('id').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const [result] = await pool.query('DELETE FROM purchases WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Purchase not found' });
      res.json({ success: true, message: 'Purchase deleted' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
