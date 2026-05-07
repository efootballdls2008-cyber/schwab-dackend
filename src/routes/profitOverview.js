const express = require('express');
const { query, body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── GET /profitOverview?userId=:id ───────────────────────────
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
      const [rows] = await pool.query('SELECT * FROM profit_overview WHERE user_id = ?', [userId]);
      // Parse JSON data field
      const parsed = rows.map((r) => ({ ...r, data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data }));
      res.json({ success: true, data: parsed });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /profitOverview ─────────────────────────────────────
router.post(
  '/',
  [
    body('userId').isInt({ min: 1 }),
    body('period').trim().notEmpty(),
    body('data').isArray().withMessage('data must be an array'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { userId, period, data } = req.body;
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const [result] = await pool.query(
        'INSERT INTO profit_overview (user_id, period, data) VALUES (?,?,?)',
        [userId, period, JSON.stringify(data)]
      );
      const [[row]] = await pool.query('SELECT * FROM profit_overview WHERE id = ?', [result.insertId]);
      res.status(201).json({ success: true, data: { ...row, data: JSON.parse(row.data) } });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
