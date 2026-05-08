const express = require('express');
const { query, body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');
const createUserNotification = require('../utils/createUserNotification');
const emailService = require('../services/emailService');

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

      // Buy orders: reserve the total cost from the user's balance atomically.
      // Uses SELECT ... FOR UPDATE so concurrent buy submissions queue up and
      // each one sees the already-reduced balance from the previous.
      // Sell orders: no balance deduction (user is receiving funds, handled on fill).
      if (type === 'buy') {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          const [[user]] = await conn.query(
            'SELECT balance FROM users WHERE id = ? FOR UPDATE',
            [userId]
          );
          if (!user || user.balance < total) {
            await conn.rollback();
            conn.release();
            return res.status(422).json({
              success: false,
              message: 'Insufficient balance to place this order',
            });
          }

          // Deduct the order total immediately (reserved until filled or cancelled)
          await conn.query(
            'UPDATE users SET balance = balance - ? WHERE id = ?',
            [total, userId]
          );

          const [result] = await conn.query(
            'INSERT INTO orders (user_id, type, coin, price, amount, total, status) VALUES (?,?,?,?,?,?,?)',
            [userId, type, coin, price, amount, total, 'open']
          );

          await conn.commit();
          conn.release();

          const [[row]] = await pool.query('SELECT * FROM orders WHERE id = ?', [result.insertId]);

          createUserNotification({
            userId,
            title: `Buy Order Placed — ${coin}`,
            message: `Buy order for ${amount} ${coin} at $${parseFloat(price).toFixed(2)} (Total: $${parseFloat(total).toFixed(2)}) is open.`,
            type: 'order',
            relatedId: result.insertId,
            relatedType: 'order',
          }).catch(err => console.error('[Notification Error]', err));

          emailService.sendBuyOrderNotification(userId, coin, amount, price, total, 'open')
            .catch(emailErr => console.error('[Email Error]', emailErr));

          return res.status(201).json({ success: true, data: row });
        } catch (err) {
          await conn.rollback();
          conn.release();
          throw err;
        }
      }

      // Sell order — no balance reservation needed
      const [result] = await pool.query(
        'INSERT INTO orders (user_id, type, coin, price, amount, total, status) VALUES (?,?,?,?,?,?,?)',
        [userId, type, coin, price, amount, total, status || 'open']
      );
      const [[row]] = await pool.query('SELECT * FROM orders WHERE id = ?', [result.insertId]);

      createUserNotification({
        userId,
        title: `Sell Order Placed — ${coin}`,
        message: `Sell order for ${amount} ${coin} at $${parseFloat(price).toFixed(2)} (Total: $${parseFloat(total).toFixed(2)}) is open.`,
        type: 'order',
        relatedId: result.insertId,
        relatedType: 'order',
      }).catch(err => console.error('[Notification Error]', err));

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
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [[order]] = await conn.query(
        'SELECT * FROM orders WHERE id = ? FOR UPDATE',
        [req.params.id]
      );
      if (!order) {
        await conn.rollback();
        conn.release();
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      if (req.user.role !== 'Admin' && req.user.id !== order.user_id) {
        await conn.rollback();
        conn.release();
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const newStatus = req.body.status;

      // Only apply balance changes when transitioning out of 'open'
      if (order.status === 'open' && newStatus !== 'open') {
        if (order.type === 'buy') {
          if (newStatus === 'cancelled') {
            // Refund the reserved amount back to the user
            await conn.query(
              'UPDATE users SET balance = balance + ? WHERE id = ?',
              [order.total, order.user_id]
            );
          }
          // 'filled': balance was already deducted at order creation — nothing to do
        } else if (order.type === 'sell') {
          if (newStatus === 'filled') {
            // Credit the user with the sale proceeds
            await conn.query(
              'UPDATE users SET balance = balance + ? WHERE id = ?',
              [order.total, order.user_id]
            );
          }
          // 'cancelled': sell order never touched balance — nothing to refund
        }
      }

      await conn.query('UPDATE orders SET status = ? WHERE id = ?', [newStatus, req.params.id]);
      await conn.commit();
      conn.release();

      const [[updated]] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);

      // Notify user of order status change
      if (newStatus === 'filled') {
        createUserNotification({
          userId: order.user_id,
          title: `Order Filled — ${order.coin}`,
          message: `Your ${order.type} order for ${order.amount} ${order.coin} at $${parseFloat(order.price).toFixed(2)} has been filled.`,
          type: 'order',
          relatedId: parseInt(req.params.id),
          relatedType: 'order',
        }).catch(err => console.error('[Notification Error]', err));
      } else if (newStatus === 'cancelled') {
        createUserNotification({
          userId: order.user_id,
          title: `Order Cancelled — ${order.coin}`,
          message: `Your ${order.type} order for ${order.amount} ${order.coin} has been cancelled.${order.type === 'buy' ? ' Your funds have been returned.' : ''}`,
          type: 'order',
          relatedId: parseInt(req.params.id),
          relatedType: 'order',
        }).catch(err => console.error('[Notification Error]', err));
      }

      res.json({ success: true, data: updated });
    } catch (err) {
      await conn.rollback();
      conn.release();
      next(err);
    }
  }
);

// ── DELETE /orders  (Admin only — delete ALL) ────────────────
router.delete('/', requireAdmin, async (req, res, next) => {
  if (req.body?.confirm !== true) {
    return res.status(400).json({
      success: false,
      message: 'Bulk delete requires { "confirm": true } in the request body.',
    });
  }
  try {
    await pool.query('DELETE FROM orders');
    res.json({ success: true, message: 'All orders deleted' });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /orders/:id  (Admin only) ─────────────────────────
router.delete(
  '/:id',
  requireAdmin,
  [param('id').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const [result] = await pool.query('DELETE FROM orders WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Order not found' });
      res.json({ success: true, message: 'Order deleted' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
