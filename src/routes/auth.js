const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const createAdminNotification = require('../utils/createAdminNotification');
const createUserNotification = require('../utils/createUserNotification');

const router = express.Router();

// ── POST /auth/register ──────────────────────────────────────
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('firstName').trim().notEmpty().withMessage('First name required'),
    body('lastName').trim().notEmpty().withMessage('Last name required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      // Check registration enabled
      const [[settings]] = await pool.query('SELECT registration_enabled FROM platform_settings LIMIT 1');
      if (settings && !settings.registration_enabled) {
        return res.status(403).json({ success: false, message: 'Registration is currently disabled' });
      }

      const { email, password, firstName, lastName } = req.body;

      const [[existing]] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) {
        return res.status(409).json({ success: false, message: 'Email already registered' });
      }

      const hashed = await bcrypt.hash(password, 12);
      const [result] = await pool.query(
        `INSERT INTO users (email, password, first_name, last_name, role, account_status, member_since)
         VALUES (?, ?, ?, ?, 'Member', 'active', ?)`,
        [email, hashed, firstName, lastName, new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })]
      );

      const userId = result.insertId;

      // ── Apply starting balance & welcome bonus ───────────────
      const [[ps]] = await pool.query(
        `SELECT default_starting_balance, welcome_bonus_amount, welcome_bonus_enabled
         FROM platform_settings LIMIT 1`
      );
      if (ps) {
        const starting = parseFloat(ps.default_starting_balance) || 0;
        const bonus    = ps.welcome_bonus_enabled ? (parseFloat(ps.welcome_bonus_amount) || 0) : 0;
        const total    = starting + bonus;

        if (total > 0) {
          await pool.query('UPDATE users SET balance = balance + ? WHERE id = ?', [total, userId]);
        }

        // Notify user about starting balance
        if (starting > 0) {
          createUserNotification({
            userId,
            title: 'Starting Balance Credited',
            message: `Your account has been funded with a starting balance of $${starting.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Start trading today!`,
            type: 'system',
          });
        }

        // Notify user about welcome bonus (separate notification)
        if (bonus > 0) {
          createUserNotification({
            userId,
            title: 'Welcome Bonus Received',
            message: `Congratulations! A welcome bonus of $${bonus.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been added to your account.`,
            type: 'system',
          });
        }
      }

      // Create default bot settings
      await pool.query('INSERT INTO bot_settings (user_id) VALUES (?)', [userId]);

      // Admin notification: new user registered
      createAdminNotification({
        title: 'New User Registered',
        message: `${firstName} ${lastName} (${email}) just created an account.`,
        type: 'user',
        relatedId: userId,
        relatedType: 'user',
      });

      const token = jwt.sign(
        { id: userId, email, role: 'Member' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.status(201).json({ success: true, token, userId });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /auth/login ─────────────────────────────────────────
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      const [[user]] = await pool.query(
        'SELECT id, email, password, role, account_status, first_name, last_name FROM users WHERE email = ?',
        [email]
      );

      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      if (user.account_status === 'suspended') {
        return res.status(403).json({ success: false, message: 'Account suspended. Contact support.' });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      // Admin notification: user login (only for non-admin users to avoid noise)
      if (user.role !== 'Admin') {
        createAdminNotification({
          title: 'User Login',
          message: `${user.first_name} ${user.last_name} (${user.email}) logged in.`,
          type: 'login',
          relatedId: user.id,
          relatedType: 'user',
        });
      }

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /auth/me ─────────────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const [[user]] = await pool.query(
      `SELECT id, email, first_name, last_name, role, avatar, balance, currency,
              phone, date_of_birth, country, address, member_since, account_status
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
