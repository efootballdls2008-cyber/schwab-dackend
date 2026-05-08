const express = require('express');
const { query, body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { buildUpdate, WALLETS_WHITELIST, WALLETS_FIELD_MAP } = require('../utils/buildUpdate');

const router = express.Router();
router.use(authenticate);

// ── GET /wallets?userId=:id ──────────────────────────────────
router.get(
  '/',
  [query('userId').isInt({ min: 1 }).withMessage('userId query param required')],
  validate,
  async (req, res, next) => {
    try {
      const userId = parseInt(req.query.userId);
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const [rows] = await pool.query('SELECT * FROM wallets WHERE user_id = ?', [userId]);
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /wallets ────────────────────────────────────────────
router.post(
  '/',
  [
    body('userId').isInt({ min: 1 }),
    body('coin').trim().notEmpty(),
    body('symbol').trim().notEmpty(),
    body('balance').isFloat({ min: 0 }),
    body('valueUsd').isFloat({ min: 0 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { userId, coin, symbol, balance, valueUsd, change30d, color } = req.body;
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const [result] = await pool.query(
        'INSERT INTO wallets (user_id, coin, symbol, balance, value_usd, change_30d, color) VALUES (?,?,?,?,?,?,?)',
        [userId, coin, symbol, balance, valueUsd, change30d || 0, color || null]
      );
      const [[row]] = await pool.query('SELECT * FROM wallets WHERE id = ?', [result.insertId]);
      res.status(201).json({ success: true, data: row });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /wallets/:id ───────────────────────────────────────
router.patch(
  '/:id',
  [param('id').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const [[wallet]] = await pool.query('SELECT * FROM wallets WHERE id = ?', [req.params.id]);
      if (!wallet) return res.status(404).json({ success: false, message: 'Wallet not found' });
      if (req.user.role !== 'Admin' && req.user.id !== wallet.user_id) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const result = buildUpdate(req.body, WALLETS_WHITELIST, WALLETS_FIELD_MAP);
      if (!result) {
        return res.status(400).json({ success: false, message: 'No valid fields' });
      }
      const { setClauses: set, values } = result;
      await pool.query(`UPDATE wallets SET ${set} WHERE id = ?`, [...values, req.params.id]);
      const [[updated]] = await pool.query('SELECT * FROM wallets WHERE id = ?', [req.params.id]);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
