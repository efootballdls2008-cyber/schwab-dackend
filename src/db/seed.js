/**
 * Seeds the database with initial data from the JSON files.
 * Run: node src/db/seed.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function seed() {
  console.log('[seed] Starting...');

  // ── Platform Settings ──────────────────────────────────────
  await pool.query(`
    INSERT IGNORE INTO platform_settings (
      id, min_deposit_amount, max_deposit_amount, min_withdrawal_amount, max_withdrawal_amount,
      trading_fee_percent, withdrawal_fee_percent, deposits_enabled, withdrawals_enabled,
      trading_enabled, kyc_required, maintenance_mode, registration_enabled, bot_trading_enabled,
      default_starting_balance, welcome_bonus_amount, welcome_bonus_enabled,
      bot_default_strategy, bot_default_risk_level, bot_max_open_trades,
      max_login_attempts, session_timeout_minutes,
      notify_on_new_deposit, notify_on_new_withdrawal, notify_on_new_user, notify_on_new_order,
      platform_name, support_email, support_phone
    ) VALUES (
      1, 100, 1000000, 50, 500000,
      0.1, 0, 1, 1,
      1, 0, 0, 1, 1,
      0, 0, 0,
      'AI Scalper Pro', 'Moderate', 3,
      5, 60,
      1, 1, 1, 0,
      'Charles Schwab', 'support@schwab.com', '+1 (800) 435-4000'
    )
  `);

  // ── Platform Account ───────────────────────────────────────
  await pool.query(`
    INSERT IGNORE INTO platform_accounts (id, account_name, bank_name, account_number, routing_number, account_type, swift_code, is_default, status)
    VALUES (1, 'Charles Schwab Main', 'Charles Schwab Bank', '4521789632', '121202211', 'Checking', 'SCHBUS33', 1, 'active')
  `);

  // ── Admin user ─────────────────────────────────────────────
  const adminHash = await bcrypt.hash('admin1234', 12);
  await pool.query(`
    INSERT INTO users (id, email, password, first_name, last_name, role, balance, currency, account_status, member_since)
    VALUES (1, 'admin@schwab.com', ?, 'Admin', 'Schwab', 'Admin', 0, 'USD', 'active', 'Jan 2024')
    ON DUPLICATE KEY UPDATE
      email     = VALUES(email),
      password  = VALUES(password),
      first_name = VALUES(first_name),
      last_name  = VALUES(last_name),
      role       = VALUES(role),
      account_status = VALUES(account_status)
  `, [adminHash]);

  // ── Demo / client user ─────────────────────────────────────
  const demoHash = await bcrypt.hash('demo1234', 12);
  await pool.query(`
    INSERT INTO users (id, email, password, first_name, last_name, role, balance, currency,
      phone, country, address, account_status, member_since)
    VALUES (2, 'demo@schwab.com', ?, 'Jonathan', 'Smith', 'Member', 119940.51633, 'USD',
      '+1 (555) 000-0000', 'United States', '123 Main Street, New York, NY 10001', 'active', 'Jan 2024')
    ON DUPLICATE KEY UPDATE
      email     = VALUES(email),
      password  = VALUES(password),
      first_name = VALUES(first_name),
      last_name  = VALUES(last_name),
      role       = VALUES(role),
      account_status = VALUES(account_status)
  `, [demoHash]);

  // ── Bot settings for demo user ─────────────────────────────
  await pool.query(`
    INSERT IGNORE INTO bot_settings (user_id, running, strategy, risk_level, pair, timeframe,
      take_profit, stop_loss, trailing_stop, auto_reinvest, max_open_trades, daily_profit_target)
    VALUES (2, 0, 'AI Scalper Pro', 'Moderate', 'BTC/USDT', '1h', 10, 3, 2, 1, 3, 15)
  `);

  // ── Market stats ───────────────────────────────────────────
  const months = [
    [1,'Jan',42000,0.52,2200,85,72],[2,'Feb',44000,0.48,2400,90,68],
    [3,'Mar',47000,0.61,2800,95,75],[4,'Apr',43000,0.55,2600,88,70],
    [5,'May',46000,0.58,2900,92,78],[6,'Jun',48000,0.62,3100,98,82],
    [7,'Jul',46500,0.59,2950,94,79],
  ];
  for (const [id, month, btc, xrp, eth, zec, ltc] of months) {
    await pool.query(
      'INSERT IGNORE INTO market_stats (id, month, btc, xrp, eth, zec, ltc) VALUES (?,?,?,?,?,?,?)',
      [id, month, btc, xrp, eth, zec, ltc]
    );
  }

  // ── Wallets ────────────────────────────────────────────────
  const wallets = [
    [1, 2, 'Bitcoin', 'BTC', 0.842, 34570, 4.2, '#f7931a'],
    [2, 2, 'Steem', 'STEEM', 1240, 14470, 4, '#4ade80'],
    [3, 2, 'Dash', 'DASH', 42.5, 54570, 4, '#4ade80'],
    [4, 2, 'Dropil', 'DROP', 98200, 34570, 4, '#4ade80'],
  ];
  for (const [id, userId, coin, symbol, balance, valueUsd, change30d, color] of wallets) {
    await pool.query(
      'INSERT IGNORE INTO wallets (id, user_id, coin, symbol, balance, value_usd, change_30d, color) VALUES (?,?,?,?,?,?,?,?)',
      [id, userId, coin, symbol, balance, valueUsd, change30d, color]
    );
  }

  // ── Holdings ───────────────────────────────────────────────
  const holdings = [
    [1, 2, 'stock', 'AAPL', 'Apple Inc.', '#a2a2a2', 0, 188.62, 189.3],
    [2, 2, 'crypto', 'BTC', 'Bitcoin', '#f7931a', 0, 62000, 67420],
    [3, 2, 'stock', 'MSFT', 'Microsoft', '#00a4ef', 0, 411.95, 415.2],
    [4, 2, 'crypto', 'ETH', 'Ethereum', '#627eea', 0, 2450, 2873],
  ];
  for (const [id, userId, type, symbol, name, color, qty, avg, cur] of holdings) {
    await pool.query(
      'INSERT IGNORE INTO holdings (id, user_id, type, symbol, name, color, quantity, avg_buy_price, current_price) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, userId, type, symbol, name, color, qty, avg, cur]
    );
  }

  // ── Profit overview ────────────────────────────────────────
  const profitData = [
    { id: 1, userId: 2, period: 'This Week', data: [
      {day:'Mon',profit:420},{day:'Tue',profit:680},{day:'Wed',profit:520},
      {day:'Thu',profit:890},{day:'Fri',profit:1100},{day:'Sat',profit:760},{day:'Sun',profit:980}
    ]},
    { id: 2, userId: 2, period: 'This Month', data: [
      {day:'1 Jun',profit:800},{day:'6 Jun',profit:1200},{day:'11 Jun',profit:900},
      {day:'16 Jun',profit:2100},{day:'21 Jun',profit:1800},{day:'26 Jun',profit:2800},{day:'30 Jun',profit:3450}
    ]},
    { id: 3, userId: 2, period: 'This Year', data: [
      {day:'Jan',profit:12000},{day:'Feb',profit:18000},{day:'Mar',profit:15000},
      {day:'Apr',profit:22000},{day:'May',profit:19000},{day:'Jun',profit:28000},
      {day:'Jul',profit:24000},{day:'Aug',profit:31000},{day:'Sep',profit:27000},
      {day:'Oct',profit:35000},{day:'Nov',profit:29000},{day:'Dec',profit:41000}
    ]},
  ];
  for (const { id, userId, period, data } of profitData) {
    await pool.query(
      'INSERT IGNORE INTO profit_overview (id, user_id, period, data) VALUES (?,?,?,?)',
      [id, userId, period, JSON.stringify(data)]
    );
  }

  console.log('[seed] Done.');
  console.log('');
  console.log('  Admin  → admin@schwab.com  / admin1234');
  console.log('  Client → demo@schwab.com   / demo1234');
  console.log('');
  await pool.end();
}

seed().catch((err) => {
  console.error('[seed] Error:', err.message);
  process.exit(1);
});
