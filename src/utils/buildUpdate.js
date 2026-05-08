/**
 * buildUpdate — safe dynamic SQL UPDATE helper
 *
 * Accepts a frozen whitelist of allowed column names (snake_case) and a
 * camelCase→snake_case field map, then filters the request body so only
 * explicitly whitelisted columns can ever appear in a SET clause.
 *
 * The whitelist is a frozen Set created at module load time, so it cannot
 * be mutated at runtime — unlike a plain array that could be .push()'d into.
 *
 * Usage:
 *   const { updates, setClauses, values } = buildUpdate(
 *     req.body,
 *     USERS_WHITELIST,
 *     USERS_FIELD_MAP
 *   );
 *   if (!updates) return res.status(400).json({ ... });
 *   await pool.query(`UPDATE users SET ${setClauses} WHERE id = ?`, [...values, id]);
 *
 * @param {object}  body       - req.body (untrusted)
 * @param {Set}     whitelist  - Frozen Set of allowed snake_case column names
 * @param {object}  fieldMap   - camelCase → snake_case mapping (optional)
 * @returns {{ updates: object, setClauses: string, values: any[] } | null}
 *   Returns null when no valid fields are present.
 */
function buildUpdate(body, whitelist, fieldMap = {}) {
  const updates = {};

  for (const [key, val] of Object.entries(body)) {
    const col = fieldMap[key] ?? key;
    // Only allow columns that are in the frozen whitelist
    if (whitelist.has(col)) {
      updates[col] = val;
    }
  }

  if (Object.keys(updates).length === 0) return null;

  // Backtick-quote column names as an extra layer of defence
  const setClauses = Object.keys(updates).map((k) => `\`${k}\` = ?`).join(', ');
  const values = Object.values(updates);

  return { updates, setClauses, values };
}

// ── Per-table frozen whitelists ───────────────────────────────
// These are Object.freeze(new Set(...)) so they cannot be mutated after
// module load. Adding a column requires an explicit code change here.

const USERS_WHITELIST = Object.freeze(new Set([
  'email', 'first_name', 'last_name', 'phone', 'date_of_birth',
  'country', 'address', 'avatar', 'currency', 'password',
  // Admin-only — enforced by the route, not the whitelist
  'balance', 'account_status', 'role',
]));

const USERS_FIELD_MAP = Object.freeze({
  firstName:     'first_name',
  lastName:      'last_name',
  dateOfBirth:   'date_of_birth',
  accountStatus: 'account_status',
});

const WALLETS_WHITELIST = Object.freeze(new Set([
  'balance', 'value_usd', 'change_30d', 'color',
]));

const WALLETS_FIELD_MAP = Object.freeze({
  valueUsd:  'value_usd',
  change30d: 'change_30d',
});

const HOLDINGS_WHITELIST = Object.freeze(new Set([
  'quantity', 'avg_buy_price', 'current_price', 'color',
]));

const HOLDINGS_FIELD_MAP = Object.freeze({
  avgBuyPrice:   'avg_buy_price',
  currentPrice:  'current_price',
});

const BOT_SETTINGS_WHITELIST = Object.freeze(new Set([
  'running', 'strategy', 'risk_level', 'pair', 'timeframe',
  'take_profit', 'stop_loss', 'trailing_stop', 'auto_reinvest',
  'max_open_trades', 'daily_profit_target', 'confidence_threshold',
  'trade_duration_seconds',
]));

const BOT_SETTINGS_FIELD_MAP = Object.freeze({
  riskLevel:            'risk_level',
  takeProfit:           'take_profit',
  stopLoss:             'stop_loss',
  trailingStop:         'trailing_stop',
  autoReinvest:         'auto_reinvest',
  maxOpenTrades:        'max_open_trades',
  dailyProfitTarget:    'daily_profit_target',
  confidenceThreshold:  'confidence_threshold',
  tradeDurationSeconds: 'trade_duration_seconds',
});

const BOT_TRADES_WHITELIST = Object.freeze(new Set([
  'exit_price', 'pnl', 'pnl_pct', 'final_pnl', 'display_pnl',
  'closed_at', 'status', 'close_reason',
]));

const BOT_TRADES_FIELD_MAP = Object.freeze({
  exitPrice:   'exit_price',
  pnlPct:      'pnl_pct',
  closedAt:    'closed_at',
  finalPnl:    'final_pnl',
  displayPnl:  'display_pnl',
  closeReason: 'close_reason',
});

module.exports = {
  buildUpdate,
  USERS_WHITELIST,      USERS_FIELD_MAP,
  WALLETS_WHITELIST,    WALLETS_FIELD_MAP,
  HOLDINGS_WHITELIST,   HOLDINGS_FIELD_MAP,
  BOT_SETTINGS_WHITELIST, BOT_SETTINGS_FIELD_MAP,
  BOT_TRADES_WHITELIST, BOT_TRADES_FIELD_MAP,
};
