const express = require('express');
const { query, body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── GET /profitOverview?userId=:id ───────────────────────────
router.get(
  '/',
  async (req, res, next) => {
    try {
      // Admin bulk fetch — no userId required
      if (!req.query.userId) {
        if (req.user.role !== 'Admin') {
          return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        const [rows] = await pool.query('SELECT * FROM profit_overview ORDER BY user_id');
        const parsed = rows.map((r) => ({ ...r, data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data }));
        return res.json({ success: true, data: parsed });
      }

      const userId = parseInt(req.query.userId);
      if (isNaN(userId)) return res.status(422).json({ success: false, message: 'Invalid userId' });
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const [rows] = await pool.query('SELECT * FROM profit_overview WHERE user_id = ?', [userId]);
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

// ── DELETE /profitOverview  (Admin only — delete ALL) ────────
router.delete('/', requireAdmin, async (req, res, next) => {
  if (req.body?.confirm !== true) {
    return res.status(400).json({
      success: false,
      message: 'Bulk delete requires { "confirm": true } in the request body.',
    });
  }
  try {
    await pool.query('DELETE FROM profit_overview');
    res.json({ success: true, message: 'All profit overview records deleted' });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /profitOverview/:id  (Admin only) ─────────────────
router.delete(
  '/:id',
  requireAdmin,
  [param('id').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const [result] = await pool.query('DELETE FROM profit_overview WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Profit overview not found' });
      res.json({ success: true, message: 'Profit overview deleted' });
    } catch (err) {
      next(err);
    }
  }
);
