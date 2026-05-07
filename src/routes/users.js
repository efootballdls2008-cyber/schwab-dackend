const express = require('express');
const bcrypt = require('bcryptjs');
const { body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');
const createUserNotification = require('../utils/createUserNotification');

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

      // Snapshot old balance BEFORE the update so we can compute the diff
      let oldBalance = null;
      if (req.user.role === 'Admin' && updates['balance'] !== undefined) {
        const [[snap]] = await pool.query('SELECT balance FROM users WHERE id = ?', [userId]);
        oldBalance = parseFloat(snap?.balance ?? 0);
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

      // ── Notify user when admin credits their balance ─────────
      if (oldBalance !== null) {
        const newBal = parseFloat(updates['balance']);
        const diff   = newBal - oldBalance;
        if (diff > 0) {
          createUserNotification({
            userId,
            title: 'Balance Updated',
            message: `Your account balance has been updated. $${diff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been added to your account by the platform.`,
            type: 'system',
          });
        }
      }

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
