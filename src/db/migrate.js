/**
 * Migration script — adds new columns for bot trading system update.
 * Run once: node src/db/migrate.js
 */
require('dotenv').config();
const pool = require('./pool');

async function migrate() {
  const migrations = [
    // bot_trades new columns
    `ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS final_pnl DECIMAL(20,8) DEFAULT NULL`,
    `ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS display_pnl DECIMAL(20,8) DEFAULT NULL`,
    `ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS expected_profit DECIMAL(20,8) DEFAULT NULL`,
    `ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS trade_duration_seconds INT DEFAULT NULL`,
    `ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS timeframe VARCHAR(20) DEFAULT '1h'`,
    `ALTER TABLE bot_trades ADD COLUMN IF NOT EXISTS close_reason VARCHAR(50) DEFAULT NULL`,
    // bot_settings new columns
    `ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS confidence_threshold DECIMAL(5,2) NOT NULL DEFAULT 45.00`,
    `ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS trade_duration_seconds INT DEFAULT NULL`,
    // admin_notifications — ensure bot_trade type is supported (type is VARCHAR so no enum change needed)
  ];

  console.log('[migrate] Running migrations...');
  for (const sql of migrations) {
    try {
      await pool.query(sql);
      console.log(`[migrate] OK: ${sql.slice(0, 80)}...`);
    } catch (err) {
      // MySQL 5.x doesn't support IF NOT EXISTS on ALTER — ignore duplicate column errors
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log(`[migrate] SKIP (already exists): ${sql.slice(0, 60)}...`);
      } else {
        console.error(`[migrate] ERROR: ${err.message}`);
      }
    }
  }
  console.log('[migrate] Done.');
  process.exit(0);
}

migrate();
