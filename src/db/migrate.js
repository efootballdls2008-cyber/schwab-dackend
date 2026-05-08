/**
 * Migration script — idempotent, safe to run on every deploy.
 * Adds missing columns and creates new tables if they don't exist.
 * Run: node src/db/migrate.js
 */
require('dotenv').config();
const pool = require('./pool');

async function migrate() {
  // ── ALTER migrations (add columns to existing tables) ────────
  const alterMigrations = [
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
    // deposits — rejection_reason column (may be missing on older DBs)
    `ALTER TABLE deposits ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL`,
    // purchases — rejection_reason column
    `ALTER TABLE purchases ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL`,
  ];

  // ── CREATE TABLE migrations (new tables) ─────────────────────
  const createMigrations = [
    // Enhanced user notifications (with category, priority, metadata)
    `CREATE TABLE IF NOT EXISTS user_notifications (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      user_id       INT NOT NULL,
      title         VARCHAR(255) NOT NULL,
      message       TEXT NOT NULL,
      type          VARCHAR(50) DEFAULT 'info',
      category      VARCHAR(50) DEFAULT 'system_alerts',
      priority      ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
      is_read       TINYINT(1) NOT NULL DEFAULT 0,
      related_id    VARCHAR(100) DEFAULT NULL,
      related_type  VARCHAR(100) DEFAULT NULL,
      metadata      JSON DEFAULT NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // Admin notifications
    `CREATE TABLE IF NOT EXISTS admin_notifications (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      title         VARCHAR(255) NOT NULL,
      message       TEXT NOT NULL,
      type          VARCHAR(50) DEFAULT 'info',
      priority      ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
      is_read       TINYINT(1) NOT NULL DEFAULT 0,
      related_id    VARCHAR(100) DEFAULT NULL,
      related_type  VARCHAR(100) DEFAULT NULL,
      user_id       INT DEFAULT NULL,
      metadata      JSON DEFAULT NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,

    // User notification settings
    `CREATE TABLE IF NOT EXISTS notification_settings (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      user_id             INT NOT NULL UNIQUE,
      email_enabled       TINYINT(1) NOT NULL DEFAULT 1,
      in_app_enabled      TINYINT(1) NOT NULL DEFAULT 1,
      email_deposits      TINYINT(1) NOT NULL DEFAULT 1,
      email_withdrawals   TINYINT(1) NOT NULL DEFAULT 1,
      email_trades        TINYINT(1) NOT NULL DEFAULT 1,
      email_bot_activity  TINYINT(1) NOT NULL DEFAULT 1,
      email_profit_loss   TINYINT(1) NOT NULL DEFAULT 1,
      email_security      TINYINT(1) NOT NULL DEFAULT 1,
      email_system        TINYINT(1) NOT NULL DEFAULT 0,
      app_deposits        TINYINT(1) NOT NULL DEFAULT 1,
      app_withdrawals     TINYINT(1) NOT NULL DEFAULT 1,
      app_trades          TINYINT(1) NOT NULL DEFAULT 1,
      app_bot_activity    TINYINT(1) NOT NULL DEFAULT 1,
      app_profit_loss     TINYINT(1) NOT NULL DEFAULT 1,
      app_security        TINYINT(1) NOT NULL DEFAULT 1,
      app_system          TINYINT(1) NOT NULL DEFAULT 1,
      app_price_alerts    TINYINT(1) NOT NULL DEFAULT 1,
      created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // Admin notification settings
    `CREATE TABLE IF NOT EXISTS admin_notification_settings (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      admin_id            INT NOT NULL UNIQUE,
      email_enabled       TINYINT(1) NOT NULL DEFAULT 1,
      email_deposits      TINYINT(1) NOT NULL DEFAULT 1,
      email_withdrawals   TINYINT(1) NOT NULL DEFAULT 1,
      email_trades        TINYINT(1) NOT NULL DEFAULT 1,
      email_bot_activity  TINYINT(1) NOT NULL DEFAULT 0,
      email_suspicious    TINYINT(1) NOT NULL DEFAULT 1,
      email_failed_tx     TINYINT(1) NOT NULL DEFAULT 1,
      email_user_reg      TINYINT(1) NOT NULL DEFAULT 1,
      created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // Bot strategy counters
    `CREATE TABLE IF NOT EXISTS bot_strategy_counters (
      user_id   INT          NOT NULL,
      strategy  VARCHAR(100) NOT NULL,
      wins      INT          NOT NULL DEFAULT 0,
      losses    INT          NOT NULL DEFAULT 0,
      total     INT          NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, strategy),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  ];

  console.log('[migrate] Running ALTER migrations...');
  for (const sql of alterMigrations) {
    try {
      await pool.query(sql);
      console.log(`[migrate] OK: ${sql.slice(0, 80)}...`);
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log(`[migrate] SKIP (already exists): ${sql.slice(0, 60)}...`);
      } else {
        console.error(`[migrate] ERROR on ALTER: ${err.message}`);
      }
    }
  }

  console.log('[migrate] Running CREATE TABLE migrations...');
  for (const sql of createMigrations) {
    try {
      await pool.query(sql);
      const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)?.[1] ?? '?';
      console.log(`[migrate] OK: table ${tableName} ensured`);
    } catch (err) {
      console.error(`[migrate] ERROR on CREATE: ${err.message}`);
    }
  }

  console.log('[migrate] Done.');
  process.exit(0);
}

migrate();
