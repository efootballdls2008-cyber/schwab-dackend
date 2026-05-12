const express = require('express');
const { body, param, query } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Valid enums
const PAYMENT_METHODS = ['bank_transfer', 'credit_card', 'wire_transfer', 'crypto'];
const ASSIGNED_TO_VALUES = ['deposit', 'buy_crypto', 'buy_stock', 'all'];

// ── GET /platformAccounts ────────────────────────────────────
// Optional query params:
//   ?context=deposit|buy_crypto|buy_stock  → filter by assigned_to (returns 'all' + exact match)
//   ?method=bank_transfer|credit_card|...  → filter by payment_method
router.get(
  '/',
  [
    query('context').optional().isIn(['deposit', 'buy_crypto', 'buy_stock']),
    query('method').optional().isIn(PAYMENT_METHODS),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { context, method } = req.query;
      let sql = 'SELECT * FROM platform_accounts WHERE 1=1';
      const params = [];

      if (context) {
        sql += ' AND (assigned_to = ? OR assigned_to = \'all\')';
        params.push(context);
      }
      if (method) {
        sql += ' AND payment_method = ?';
        params.push(method);
      }

      sql += ' ORDER BY is_default DESC, created_at DESC';

      const [rows] = await pool.query(sql, params);
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /platformAccounts  (Admin) ──────────────────────────
router.post(
  '/',
  requireAdmin,
  [
    body('accountName').trim().notEmpty().withMessage('Account name is required'),
    body('paymentMethod').isIn(PAYMENT_METHODS).withMessage('Invalid payment method'),
    body('assignedTo').isIn(ASSIGNED_TO_VALUES).withMessage('Invalid assigned_to value'),
    // Crypto requires walletAddress; bank types require bankName + accountNumber
    body('walletAddress').if(body('paymentMethod').equals('crypto')).trim().notEmpty().withMessage('Wallet address required for crypto'),
    body('bankName').if(body('paymentMethod').not().equals('crypto')).trim().notEmpty().withMessage('Bank name required'),
    body('accountNumber').if(body('paymentMethod').not().equals('crypto')).trim().notEmpty().withMessage('Account number required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const {
        accountName, paymentMethod, bankName, accountNumber, routingNumber,
        accountType, swiftCode, walletAddress, network, bankAddress, myAddress,
        homeAddress, iban, sortCode, currencyAccepted, coinSymbol, qrCodeImage,
        isDefault, assignedTo, status,
      } = req.body;

      const [result] = await pool.query(
        `INSERT INTO platform_accounts
          (account_name, payment_method, bank_name, account_number, routing_number,
           account_type, swift_code, wallet_address, network, bank_address, my_address,
           home_address, iban, sort_code, currency_accepted, coin_symbol, qr_code_image,
           is_default, assigned_to, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          accountName,
          paymentMethod,
          bankName || null,
          accountNumber || null,
          routingNumber || null,
          accountType || null,
          swiftCode || null,
          walletAddress || null,
          network || null,
          bankAddress || null,
          myAddress || null,
          homeAddress || null,
          iban || null,
          sortCode || null,
          currencyAccepted || null,
          coinSymbol || null,
          qrCodeImage || null,
          isDefault ? 1 : 0,
          assignedTo || 'deposit',
          status || 'active',
        ]
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

      const fieldMap = {
        accountName:      'account_name',
        paymentMethod:    'payment_method',
        bankName:         'bank_name',
        accountNumber:    'account_number',
        routingNumber:    'routing_number',
        accountType:      'account_type',
        swiftCode:        'swift_code',
        walletAddress:    'wallet_address',
        network:          'network',
        bankAddress:      'bank_address',
        myAddress:        'my_address',
        homeAddress:      'home_address',
        iban:             'iban',
        sortCode:         'sort_code',
        currencyAccepted: 'currency_accepted',
        coinSymbol:       'coin_symbol',
        qrCodeImage:      'qr_code_image',
        isDefault:        'is_default',
        assignedTo:       'assigned_to',
      };
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
