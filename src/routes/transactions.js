const express = require('express');
const { query, body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── GET /transactions?userId=:id ─────────────────────────────
router.get(
  '/',
  async (req, res, next) => {
    try {
      // Admin with no userId filter → return all transactions
      if (!req.query.userId) {
        if (req.user.role !== 'Admin') {
          return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        const [rows] = await pool.query('SELECT * FROM transactions ORDER BY created_at DESC');
        return res.json({ success: true, data: rows });
      }

      // userId provided → ownership check
      const userId = parseInt(req.query.userId);
      if (isNaN(userId)) {
        return res.status(422).json({ success: false, message: 'Invalid userId' });
      }
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const [rows] = await pool.query(
        'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /transactions ───────────────────────────────────────
router.post(
  '/',
  [
    body('userId').isInt({ min: 1 }),
    body('txId').trim().notEmpty(),
    body('coin').trim().notEmpty(),
    body('coinSymbol').trim().notEmpty(),
    body('amount').isFloat({ min: 0 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { userId, txId, from, to, coin, coinSymbol, coinColor, amount, date, time, status } = req.body;
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const [result] = await pool.query(
        `INSERT INTO transactions (user_id, tx_id, \`from\`, \`to\`, coin, coin_symbol, coin_color, amount, date, time, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [userId, txId, from || null, to || null, coin, coinSymbol, coinColor || null,
         amount, date || null, time || null, status || 'pending']
      );
      const [[row]] = await pool.query('SELECT * FROM transactions WHERE id = ?', [result.insertId]);
      res.status(201).json({ success: true, data: row });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
