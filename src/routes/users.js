const express = require('express');
const bcrypt = require('bcryptjs');
const { body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All user routes require authentication
router.use(authenticate);

// ── GET /users  (Admin only) ─────────────────────────────────
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, email, first_name, last_name, role, avatar, balance, currency,
              phone, country, member_since, account_status, created_at
       FROM users ORDER BY id DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /users/:id ───────────────────────────────────────────
router.get(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('Invalid user ID')],
  validate,
  async (req, res, next) => {
    try {
      const userId = parseInt(req.params.id);
      // Non-admins can only fetch their own profile
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const [[user]] = await pool.query(
        `SELECT id, email, first_name, last_name, role, avatar, balance, currency,
                phone, date_of_birth, country, address, member_since, account_status
         FROM users WHERE id = ?`,
        [userId]
      );
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /users/:id ─────────────────────────────────────────
router.patch(
  '/:id',
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid user ID'),
    body('email').optional().isEmail().normalizeEmail(),
    body('firstName').optional().trim().notEmpty(),
    body('lastName').optional().trim().notEmpty(),
    body('phone').optional().trim(),
    body('country').optional().trim(),
    body('address').optional().trim(),
    body('balance').optional().isFloat({ min: 0 }).withMessage('Balance must be a positive number'),
    body('accountStatus').optional().isIn(['active', 'suspended', 'pending']),
    body('password').optional().isLength({ min: 6 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const userId = parseInt(req.params.id);
      if (req.user.role !== 'Admin' && req.user.id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const allowed = ['email', 'first_name', 'last_name', 'phone', 'date_of_birth',
                       'country', 'address', 'avatar', 'currency'];
      // Admin-only fields
      if (req.user.role === 'Admin') {
        allowed.push('balance', 'account_status', 'role');
      }

      const fieldMap = {
        firstName: 'first_name', lastName: 'last_name', dateOfBirth: 'date_of_birth',
        accountStatus: 'account_status',
      };

      const updates = {};
      for (const [key, val] of Object.entries(req.body)) {
        if (key === 'password') {
          updates['password'] = await bcrypt.hash(val, 12);
          continue;
        }
        const col = fieldMap[key] || key;
        if (allowed.includes(col)) updates[col] = val;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, message: 'No valid fields to update' });
      }

      const setClauses = Object.keys(updates).map((k) => `\`${k}\` = ?`).join(', ');
      const values = [...Object.values(updates), userId];
      await pool.query(`UPDATE users SET ${setClauses} WHERE id = ?`, values);

      const [[updated]] = await pool.query(
        `SELECT id, email, first_name, last_name, role, avatar, balance, currency,
                phone, date_of_birth, country, address, member_since, account_status
         FROM users WHERE id = ?`,
        [userId]
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /users/:id  (Admin only) ─────────────────────────
router.delete(
  '/:id',
  requireAdmin,
  [param('id').isInt({ min: 1 }).withMessage('Invalid user ID')],
  validate,
  async (req, res, next) => {
    try {
      const [result] = await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      res.json({ success: true, message: 'User deleted' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
