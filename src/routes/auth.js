const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const createAdminNotification = require('../utils/createAdminNotification');
const createUserNotification = require('../utils/createUserNotification');
const emailService = require('../services/emailService');

const router = express.Router();

// ── POST /auth/register ──────────────────────────────────────
// Accepts the 3-step registration payload:
//   Step 1 — Personal Info: username, firstName, lastName, email, phone
//   Step 2 — Location:      country
//   Step 3 — Security:      password, confirmPassword (CAPTCHA verified client-side)
router.post(
  '/register',
  [
    // Personal Info
    body('username')
      .optional()
      .trim()
      .isLength({ min: 3, max: 100 }).withMessage('Username must be 3-100 characters')
      .matches(/^[a-zA-Z0-9_.-]+$/).withMessage('Username can only contain letters, numbers, dots, dashes, and underscores'),
    body('firstName')
      .trim()
      .notEmpty().withMessage('First name is required')
      .isLength({ max: 100 }).withMessage('First name too long'),
    body('lastName')
      .trim()
      .notEmpty().withMessage('Last name is required')
      .isLength({ max: 100 }).withMessage('Last name too long'),
    body('email')
      .isEmail().withMessage('Valid email is required')
      .normalizeEmail(),
    body('phone')
      .trim()
      .notEmpty().withMessage('Phone number is required')
      .matches(/^\+?[\d\s\-().]{7,20}$/).withMessage('Enter a valid phone number'),
    // Location
    body('country')
      .trim()
      .notEmpty().withMessage('Country is required')
      .isLength({ max: 100 }).withMessage('Country name too long'),
    // Security
    body('password')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
      .matches(/[a-z]/).withMessage('Password must contain a lowercase letter')
      .matches(/[\d\W]/).withMessage('Password must contain a number or special character'),
    body('confirmPassword')
      .notEmpty().withMessage('Please confirm your password')
      .custom((value, { req }) => {
        if (value !== req.body.password) throw new Error('Passwords do not match');
        return true;
      }),
  ],
  validate,
  async (req, res, next) => {
    try {
      // Check registration enabled
      const [[settings]] = await pool.query(
        'SELECT registration_enabled FROM platform_settings LIMIT 1'
      );
      if (settings && !settings.registration_enabled) {
        return res.status(403).json({
          success: false,
          message: 'Registration is currently disabled. Please try again later.',
        });
      }

      const { username, firstName, lastName, email, phone, country, password } = req.body;

      // Check email uniqueness
      const [[existingEmail]] = await pool.query(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          field: 'email',
          message: 'An account with this email already exists.',
        });
      }

      // Check username uniqueness (only if username is provided)
      if (username && username.trim()) {
        const [[existingUsername]] = await pool.query(
          'SELECT id FROM users WHERE username = ?',
          [username]
        );
        if (existingUsername) {
          return res.status(409).json({
            success: false,
            field: 'username',
            message: 'This username is already taken.',
          });
        }
      }

      const hashed = await bcrypt.hash(password, 12);
      const memberSince = new Date().toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      });

      const [result] = await pool.query(
        `INSERT INTO users
           (email, password, first_name, last_name, phone, country,
            role, account_status, member_since)
         VALUES (?, ?, ?, ?, ?, ?, 'Member', 'active', ?)`,
        [email, hashed, firstName, lastName, phone, country, memberSince]
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
          await pool.query(
            'UPDATE users SET balance = balance + ? WHERE id = ?',
            [total, userId]
          );
        }

        if (starting > 0) {
          createUserNotification({
            userId,
            title: 'Starting Balance Credited',
            message: `Your account has been funded with a starting balance of $${starting.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Start trading today!`,
            type: 'system',
          }).catch(err => console.error('[Notification Error]', err));
        }

        if (bonus > 0) {
          createUserNotification({
            userId,
            title: 'Welcome Bonus Received',
            message: `Congratulations! A welcome bonus of $${bonus.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been added to your account.`,
            type: 'system',
          }).catch(err => console.error('[Notification Error]', err));
        }
      }

      // Create default bot settings
      await pool.query('INSERT INTO bot_settings (user_id) VALUES (?)', [userId]);

      // Welcome notification
      createUserNotification({
        userId,
        title: 'Welcome to Charles Schwab Trading Platform! 🎉',
        message: `Hi ${firstName}! Welcome aboard. We're excited to have you join our trading community. Explore our platform features, check out the market overview, and start your trading journey today. If you need any help, our support team is here for you 24/7.`,
        type: 'system',
      }).catch(err => console.error('[Notification Error]', err));

      // Send welcome email (fire-and-forget)
      emailService.sendWelcomeEmail(userId, email, firstName)
        .catch(emailErr => console.error('[Email Error] sendWelcomeEmail:', emailErr));

      // Admin notification
      createAdminNotification({
        title: 'New User Registered',
        message: `${firstName} ${lastName} (${email}) from ${country} just created an account.`,
        type: 'user_registration',
        relatedId: userId,
        relatedType: 'user',
      }).catch(err => console.error('[Notification Error]', err));

      emailService.sendAdminNotification(
        'New User Registered',
        `${firstName} ${lastName} (${email}) — ${country} just created an account.`,
        'user',
        userId
      ).catch(emailErr => console.error('[Email Error] sendAdminNotification:', emailErr));

      const token = jwt.sign(
        { id: userId, email, role: 'Member' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      return res.status(201).json({ success: true, token, userId });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /auth/login ─────────────────────────────────────────
// Per-account brute-force constants
const LOGIN_MAX_ATTEMPTS  = parseInt(process.env.LOGIN_MAX_ATTEMPTS)  || 10;
const LOGIN_LOCKOUT_MINS  = parseInt(process.env.LOGIN_LOCKOUT_MINS)  || 15;

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

      // SELECT * so the query doesn't fail if the brute-force columns
      // (failed_login_attempts, locked_until) haven't been migrated yet.
      const [[user]] = await pool.query(
        `SELECT * FROM users WHERE email = ?`,
        [email]
      );

      if (!user) {
        // Respond with the same message to avoid user enumeration
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      if (user.account_status === 'suspended') {
        return res.status(403).json({
          success: false,
          message: 'Account suspended. Contact support.',
        });
      }

      // Per-account lockout check (gracefully skipped if columns not yet migrated)
      try {
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
          const remaining = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
          return res.status(429).json({
            success: false,
            message: `Too many failed attempts. Try again in ${remaining} minute${remaining !== 1 ? 's' : ''}.`,
          });
        }
      } catch { /* columns not yet migrated — skip lockout check */ }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        // Increment failed attempt counter; lock account after threshold.
        // Wrapped in try/catch — if the columns don't exist yet, just return 401.
        try {
          const attempts = (user.failed_login_attempts || 0) + 1;
          if (attempts >= LOGIN_MAX_ATTEMPTS) {
            const lockedUntil = new Date(Date.now() + LOGIN_LOCKOUT_MINS * 60 * 1000);
            await pool.query(
              'UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?',
              [attempts, lockedUntil, user.id]
            );
            return res.status(429).json({
              success: false,
              message: `Too many failed attempts. Account locked for ${LOGIN_LOCKOUT_MINS} minutes.`,
            });
          }
          await pool.query(
            'UPDATE users SET failed_login_attempts = ? WHERE id = ?',
            [attempts, user.id]
          );
        } catch { /* columns not yet migrated — skip counter update */ }
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      // Successful login — reset lockout counters (best-effort)
      pool.query(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
        [user.id]
      ).catch(() => { /* columns not yet migrated — safe to ignore */ });

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      // Welcome-back notification: throttled to once per day
      const today = new Date().toISOString().slice(0, 10);
      const [[recentWelcome]] = await pool.query(
        `SELECT id FROM user_notifications
         WHERE user_id = ? AND type = 'system' AND title = 'Welcome Back! 👋'
           AND DATE(created_at) = ?
         LIMIT 1`,
        [user.id, today]
      );
      if (!recentWelcome) {
        createUserNotification({
          userId: user.id,
          title: 'Welcome Back! 👋',
          message: `Hi ${user.first_name}! You've successfully logged in. Check out the latest market trends and manage your portfolio.`,
          type: 'system',
        }).catch(err => console.error('[Notification Error]', err));
      }

      return res.json({
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
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/refresh ────────────────────────────────────────
router.post('/refresh', authenticate, async (req, res, next) => {
  try {
    const [[user]] = await pool.query(
      'SELECT id, email, role, account_status FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (user.account_status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Account suspended' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({ success: true, token });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
