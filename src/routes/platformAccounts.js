const express = require('express');
const { body, param } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── GET /platformAccounts ────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM platform_accounts ORDER BY is_default DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// ── POST /platformAccounts  (Admin) ──────────────────────────
router.post(
  '/',
  requireAdmin,
  [
    body('accountName').trim().notEmpty(),
    body('bankName').trim().notEmpty(),
    body('accountNumber').trim().notEmpty(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { accountName, bankName, accountNumber, routingNumber, accountType, swiftCode, isDefault, status } = req.body;
      const [result] = await pool.query(
        `INSERT INTO platform_accounts (account_name, bank_name, account_number, routing_number, account_type, swift_code, is_default, status)
         VALUES (?,?,?,?,?,?,?,?)`,
        [accountName, bankName, accountNumber, routingNumber || null, accountType || null,
         swiftCode || null, isDefault ? 1 : 0, status || 'active']
      );
      const [[row]] = await pool.query('SELECT * FROM platform_accounts WHERE id = ?', [result.insertId]);
      res.status(201).json({ success: true, data: row });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /platformAccounts/:id  (Admin) ─────────────────────
router.patch(
  '/:id',
  requireAdmin,
  [param('id').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const [[account]] = await pool.query('SELECT * FROM platform_accounts WHERE id = ?', [req.params.id]);
      if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

      const fieldMap = { accountName: 'account_name', bankName: 'bank_name', accountNumber: 'account_number',
                         routingNumber: 'routing_number', accountType: 'account_type', swiftCode: 'swift_code',
                         isDefault: 'is_default' };
      const allowed = Object.values(fieldMap).concat(['status']);
      const updates = {};
      for (const [k, v] of Object.entries(req.body)) {
        const col = fieldMap[k] || k;
        if (allowed.includes(col)) updates[col] = v;
      }
      if (!Object.keys(updates).length) {
        return res.status(400).json({ success: false, message: 'No valid fields' });
      }
      const set = Object.keys(updates).map((k) => `\`${k}\` = ?`).join(', ');
      await pool.query(`UPDATE platform_accounts SET ${set} WHERE id = ?`, [...Object.values(updates), req.params.id]);
      const [[updated]] = await pool.query('SELECT * FROM platform_accounts WHERE id = ?', [req.params.id]);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /platformAccounts/:id  (Admin) ────────────────────
router.delete(
  '/:id',
  requireAdmin,
  [param('id').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const [result] = await pool.query('DELETE FROM platform_accounts WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Account not found' });
      res.json({ success: true, message: 'Account deleted' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
