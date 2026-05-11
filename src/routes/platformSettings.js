const express = require('express');
const { body } = require('express-validator');
const pool = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── GET /platformSettings ────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    // Ensure a default row always exists
    await pool.query(`
      INSERT IGNORE INTO platform_settings (id) VALUES (1)
    `);
    const [[row]] = await pool.query('SELECT * FROM platform_settings LIMIT 1');
    res.json({ success: true, data: row || null });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /platformSettings  (Admin only) ────────────────────
router.patch(
  '/',
  requireAdmin,
  [
    body('minDepositAmount').optional().isFloat({ min: 0 }),
    body('maxDepositAmount').optional().isFloat({ min: 0 }),
    body('minWithdrawalAmount').optional().isFloat({ min: 0 }),
    body('maxWithdrawalAmount').optional().isFloat({ min: 0 }),
    body('tradingFeePercent').optional().isFloat({ min: 0, max: 100 }),
    body('withdrawalFeePercent').optional().isFloat({ min: 0, max: 100 }),
    body('depositsEnabled').optional().isBoolean(),
    body('withdrawalsEnabled').optional().isBoolean(),
    body('tradingEnabled').optional().isBoolean(),
    body('maintenanceMode').optional().isBoolean(),
    body('registrationEnabled').optional().isBoolean(),
    body('botTradingEnabled').optional().isBoolean(),
    body('botDefaultStrategy').optional().trim().notEmpty(),
    body('botDefaultRiskLevel').optional().trim().notEmpty(),
    body('botDefaultTimeframe').optional().trim().notEmpty(),
    body('botConfidenceThreshold').optional().isFloat({ min: 0, max: 100 }),
    body('supportEmail').optional().isEmail(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const fieldMap = {
        minDepositAmount: 'min_deposit_amount',
        maxDepositAmount: 'max_deposit_amount',
        minWithdrawalAmount: 'min_withdrawal_amount',
        maxWithdrawalAmount: 'max_withdrawal_amount',
        tradingFeePercent: 'trading_fee_percent',
        withdrawalFeePercent: 'withdrawal_fee_percent',
        depositsEnabled: 'deposits_enabled',
        withdrawalsEnabled: 'withdrawals_enabled',
        tradingEnabled: 'trading_enabled',
        kycRequired: 'kyc_required',
        maintenanceMode: 'maintenance_mode',
        registrationEnabled: 'registration_enabled',
        botTradingEnabled: 'bot_trading_enabled',
        defaultStartingBalance: 'default_starting_balance',
        welcomeBonusAmount: 'welcome_bonus_amount',
        welcomeBonusEnabled: 'welcome_bonus_enabled',
        botDefaultStrategy: 'bot_default_strategy',
        botDefaultRiskLevel: 'bot_default_risk_level',
        botDefaultTimeframe: 'bot_default_timeframe',
        botConfidenceThreshold: 'bot_confidence_threshold',
        botMaxOpenTrades: 'bot_max_open_trades',
        maxLoginAttempts: 'max_login_attempts',
        sessionTimeoutMinutes: 'session_timeout_minutes',
        notifyOnNewDeposit: 'notify_on_new_deposit',
        notifyOnNewWithdrawal: 'notify_on_new_withdrawal',
        notifyOnNewUser: 'notify_on_new_user',
        notifyOnNewOrder: 'notify_on_new_order',
        platformName: 'platform_name',
        supportEmail: 'support_email',
        supportPhone: 'support_phone',
      };

      const updates = {};
      for (const [k, v] of Object.entries(req.body)) {
        // Skip id and any key not in the fieldMap to prevent SQL errors
        if (k === 'id' || k === 'updatedAt') continue;
        const col = fieldMap[k];
        if (!col) continue; // ignore unknown keys
        updates[col] = v;
      }
      if (!Object.keys(updates).length) {
        return res.status(400).json({ success: false, message: 'No valid fields' });
      }
      const set = Object.keys(updates).map((k) => `\`${k}\` = ?`).join(', ');
      await pool.query(`UPDATE platform_settings SET ${set} LIMIT 1`, Object.values(updates));
      const [[updated]] = await pool.query('SELECT * FROM platform_settings LIMIT 1');

      // ── Propagate bot defaults to all existing user bot_settings rows ──
      // Only update the fields that were actually sent in this request so we
      // don't accidentally overwrite user-customised settings with stale values.
      const botFieldMap = {
        botDefaultStrategy:      { col: 'strategy',             val: req.body.botDefaultStrategy },
        botDefaultRiskLevel:     { col: 'risk_level',           val: req.body.botDefaultRiskLevel },
        botDefaultTimeframe:     { col: 'timeframe',            val: req.body.botDefaultTimeframe },
        botConfidenceThreshold:  { col: 'confidence_threshold', val: req.body.botConfidenceThreshold },
        botMaxOpenTrades:        { col: 'max_open_trades',      val: req.body.botMaxOpenTrades },
      };

      const botUpdates = {};
      for (const [key, { col, val }] of Object.entries(botFieldMap)) {
        if (req.body[key] !== undefined) botUpdates[col] = val;
      }

      if (Object.keys(botUpdates).length > 0) {
        const botSet = Object.keys(botUpdates).map(k => `\`${k}\` = ?`).join(', ');
        await pool.query(
          `UPDATE bot_settings SET ${botSet}`,
          Object.values(botUpdates)
        );
      }

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
