const express = require('express');
const bcrypt = require('bcryptjs');
const { body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');
const createUserNotification = require('../utils/createUserNotification');
const { buildUpdate, USERS_WHITELIST, USERS_FIELD_MAP } = require('../utils/buildUpdate');

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

      // Non-admin users cannot touch admin-only fields
      const adminOnlyFields = new Set(['balance', 'account_status', 'role']);
      const effectiveWhitelist = req.user.role === 'Admin'
        ? USERS_WHITELIST
        : new Set([...USERS_WHITELIST].filter(c => !adminOnlyFields.has(c)));

      // Handle password separately (needs hashing before storage)
      const bodyWithoutPassword = { ...req.body };
      let hashedPassword = null;
      if (req.body.password) {
        hashedPassword = await bcrypt.hash(req.body.password, 12);
        delete bodyWithoutPassword.password;
      }

      const result = buildUpdate(bodyWithoutPassword, effectiveWhitelist, USERS_FIELD_MAP);
      if (!result && !hashedPassword) {
        return res.status(400).json({ success: false, message: 'No valid fields to update' });
      }

      const updates = result?.updates ?? {};
      if (hashedPassword) updates['password'] = hashedPassword;

      const setClauses = Object.keys(updates).map((k) => `\`${k}\` = ?`).join(', ');
      const values = [...Object.values(updates), userId];
      // Snapshot old balance BEFORE the update so we can compute the diff
      let oldBalance = null;
      if (req.user.role === 'Admin' && updates['balance'] !== undefined) {
        const [[snap]] = await pool.query('SELECT balance FROM users WHERE id = ?', [userId]);
        oldBalance = parseFloat(snap?.balance ?? 0);
      }

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
