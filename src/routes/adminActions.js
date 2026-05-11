const express = require('express');
const { body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

// ── GET /adminActions ────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM admin_actions ORDER BY timestamp DESC LIMIT 200'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// ── POST /adminActions ───────────────────────────────────────
router.post(
  '/',
  [
    body('action').trim().notEmpty(),
    body('details').trim().notEmpty(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { action, targetUserId, targetId, details } = req.body;
      const [result] = await pool.query(
        'INSERT INTO admin_actions (admin_id, action, target_user_id, target_id, details) VALUES (?,?,?,?,?)',
        [req.user.id, action, targetUserId || null, targetId || null, details]
      );
      const [[row]] = await pool.query('SELECT * FROM admin_actions WHERE id = ?', [result.insertId]);
      res.status(201).json({ success: true, data: row });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /adminActions  (Admin only — delete ALL) ──────────
router.delete('/', async (req, res, next) => {
  if (req.body?.confirm !== true) {
    return res.status(400).json({
      success: false,
      message: 'Bulk delete requires { "confirm": true } in the request body.',
    });
  }
  try {
    await pool.query('DELETE FROM admin_actions');
    res.json({ success: true, message: 'All admin actions deleted' });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /adminActions/:id  (Admin only) ───────────────────
router.delete(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('Invalid action ID')],
  validate,
  async (req, res, next) => {
    try {
      const [result] = await pool.query('DELETE FROM admin_actions WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Action not found' });
      res.json({ success: true, message: 'Action deleted' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
