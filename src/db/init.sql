-- ============================================================
-- Charles Schwab Trading Platform — MySQL Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS schwab_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE schwab_db;

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password        VARCHAR(255) NOT NULL,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  role            ENUM('Member','Admin') NOT NULL DEFAULT 'Member',
  avatar          VARCHAR(500) DEFAULT NULL,
  balance         DECIMAL(20,8) NOT NULL DEFAULT 0,
  currency        VARCHAR(10) NOT NULL DEFAULT 'USD',
  phone           VARCHAR(50) DEFAULT NULL,
  date_of_birth   DATE DEFAULT NULL,
  country         VARCHAR(100) DEFAULT NULL,
  address         TEXT DEFAULT NULL,
  member_since    VARCHAR(50) DEFAULT NULL,
  account_status  ENUM('active','suspended','pending') NOT NULL DEFAULT 'active',
  kyc_verified    TINYINT(1) NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── Platform Settings ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_settings (
  id                        INT AUTO_INCREMENT PRIMARY KEY,
  min_deposit_amount        DECIMAL(20,2) NOT NULL DEFAULT 10,
  max_deposit_amount        DECIMAL(20,2) NOT NULL DEFAULT 100000,
  min_withdrawal_amount     DECIMAL(20,2) NOT NULL DEFAULT 10,
  max_withdrawal_amount     DECIMAL(20,2) NOT NULL DEFAULT 50000,
  trading_fee_percent       DECIMAL(10,4) NOT NULL DEFAULT 0.1,
  withdrawal_fee_percent    DECIMAL(10,4) NOT NULL DEFAULT 0,
  deposits_enabled          TINYINT(1) NOT NULL DEFAULT 1,
  withdrawals_enabled       TINYINT(1) NOT NULL DEFAULT 1,
  trading_enabled           TINYINT(1) NOT NULL DEFAULT 1,
  kyc_required              TINYINT(1) NOT NULL DEFAULT 0,
  maintenance_mode          TINYINT(1) NOT NULL DEFAULT 0,
  registration_enabled      TINYINT(1) NOT NULL DEFAULT 1,
  bot_trading_enabled       TINYINT(1) NOT NULL DEFAULT 1,
  default_starting_balance  DECIMAL(20,2) NOT NULL DEFAULT 0,
  welcome_bonus_amount      DECIMAL(20,2) NOT NULL DEFAULT 0,
  welcome_bonus_enabled     TINYINT(1) NOT NULL DEFAULT 0,
  bot_default_strategy      VARCHAR(100) DEFAULT 'AI Scalper Pro',
  bot_default_risk_level    VARCHAR(50) DEFAULT 'Moderate',
  bot_default_timeframe     VARCHAR(20) DEFAULT '1h',
  bot_confidence_threshold  DECIMAL(5,2) NOT NULL DEFAULT 70.00,
  bot_max_open_trades       INT NOT NULL DEFAULT 3,
  max_login_attempts        INT NOT NULL DEFAULT 5,
  session_timeout_minutes   INT NOT NULL DEFAULT 60,
  notify_on_new_deposit     TINYINT(1) NOT NULL DEFAULT 1,
  notify_on_new_withdrawal  TINYINT(1) NOT NULL DEFAULT 1,
  notify_on_new_user        TINYINT(1) NOT NULL DEFAULT 1,
  notify_on_new_order       TINYINT(1) NOT NULL DEFAULT 0,
  platform_name             VARCHAR(100) DEFAULT 'Charles Schwab',
  support_email             VARCHAR(255) DEFAULT 'support@schwab.com',
  support_phone             VARCHAR(50) DEFAULT '+1 (800) 435-4000',
  updated_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── Platform Accounts ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_accounts (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  account_name    VARCHAR(255) NOT NULL,
  bank_name       VARCHAR(255) NOT NULL,
  account_number  VARCHAR(100) NOT NULL,
  routing_number  VARCHAR(100) DEFAULT NULL,
  account_type    VARCHAR(100) DEFAULT NULL,
  swift_code      VARCHAR(50) DEFAULT NULL,
  is_default      TINYINT(1) NOT NULL DEFAULT 0,
  status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Wallets ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  coin        VARCHAR(100) NOT NULL,
  symbol      VARCHAR(20) NOT NULL,
  balance     DECIMAL(30,10) NOT NULL DEFAULT 0,
  value_usd   DECIMAL(20,2) NOT NULL DEFAULT 0,
  change_30d  DECIMAL(10,4) NOT NULL DEFAULT 0,
  color       VARCHAR(20) DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Orders ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  type        ENUM('buy','sell') NOT NULL,
  coin        VARCHAR(50) NOT NULL,
  price       DECIMAL(20,8) NOT NULL,
  amount      DECIMAL(20,8) NOT NULL,
  total       DECIMAL(20,8) NOT NULL,
  status      ENUM('open','filled','cancelled') NOT NULL DEFAULT 'open',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Transactions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  tx_id       VARCHAR(100) NOT NULL UNIQUE,
  `from`      VARCHAR(255) DEFAULT NULL,
  `to`        VARCHAR(255) DEFAULT NULL,
  coin        VARCHAR(100) NOT NULL,
  coin_symbol VARCHAR(20) NOT NULL,
  coin_color  VARCHAR(20) DEFAULT NULL,
  amount      DECIMAL(20,8) NOT NULL,
  date        VARCHAR(50) DEFAULT NULL,
  time        VARCHAR(20) DEFAULT NULL,
  status      ENUM('completed','pending','cancelled') NOT NULL DEFAULT 'pending',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Trade History ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trade_history (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  trade_id      VARCHAR(100) NOT NULL UNIQUE,
  date          VARCHAR(50) DEFAULT NULL,
  time          VARCHAR(20) DEFAULT NULL,
  type          ENUM('Spot','Futures') NOT NULL DEFAULT 'Spot',
  executed_by   VARCHAR(100) DEFAULT NULL,
  asset         VARCHAR(100) NOT NULL,
  asset_symbol  VARCHAR(20) NOT NULL,
  asset_color   VARCHAR(20) DEFAULT NULL,
  pair          VARCHAR(50) NOT NULL,
  side          ENUM('Buy','Sell') NOT NULL,
  amount        DECIMAL(20,8) NOT NULL,
  amount_usd    DECIMAL(20,2) NOT NULL,
  entry_price   DECIMAL(20,8) NOT NULL,
  exit_price    DECIMAL(20,8) DEFAULT NULL,
  profit_loss   DECIMAL(20,8) DEFAULT NULL,
  pl_pct        DECIMAL(10,4) DEFAULT NULL,
  status        ENUM('completed','pending','cancelled') NOT NULL DEFAULT 'pending',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Bot Trades ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_trades (
  id          VARCHAR(100) PRIMARY KEY,
  user_id     INT NOT NULL,
  pair        VARCHAR(50) NOT NULL,
  side        ENUM('buy','sell') NOT NULL,
  entry_price DECIMAL(20,8) NOT NULL,
  exit_price  DECIMAL(20,8) DEFAULT NULL,
  amount      DECIMAL(20,10) NOT NULL,
  pnl         DECIMAL(20,8) NOT NULL DEFAULT 0,
  pnl_pct     DECIMAL(10,4) NOT NULL DEFAULT 0,
  strategy    VARCHAR(100) DEFAULT NULL,
  `signal`    TEXT DEFAULT NULL,
  opened_at   DATETIME DEFAULT NULL,
  closed_at   DATETIME DEFAULT NULL,
  status      ENUM('open','closed') NOT NULL DEFAULT 'open',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Bot Settings ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_settings (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  user_id             INT NOT NULL UNIQUE,
  running             TINYINT(1) NOT NULL DEFAULT 0,
  strategy            VARCHAR(100) DEFAULT 'AI Scalper Pro',
  risk_level          VARCHAR(50) DEFAULT 'Moderate',
  pair                VARCHAR(50) DEFAULT 'BTC/USDT',
  timeframe           VARCHAR(20) DEFAULT '1h',
  take_profit         DECIMAL(10,4) DEFAULT 10,
  stop_loss           DECIMAL(10,4) DEFAULT 3,
  trailing_stop       DECIMAL(10,4) DEFAULT 2,
  auto_reinvest       TINYINT(1) NOT NULL DEFAULT 1,
  max_open_trades     INT NOT NULL DEFAULT 3,
  daily_profit_target DECIMAL(10,4) DEFAULT 15,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Market Stats ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_stats (
  id      INT AUTO_INCREMENT PRIMARY KEY,
  month   VARCHAR(20) NOT NULL,
  btc     DECIMAL(20,2) DEFAULT NULL,
  xrp     DECIMAL(20,6) DEFAULT NULL,
  eth     DECIMAL(20,2) DEFAULT NULL,
  zec     DECIMAL(20,2) DEFAULT NULL,
  ltc     DECIMAL(20,2) DEFAULT NULL
);

-- ── Deposits / Withdrawals ───────────────────────────────────
CREATE TABLE IF NOT EXISTS deposits (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  user_id           INT NOT NULL,
  type              ENUM('deposit','withdraw') NOT NULL,
  method            VARCHAR(100) NOT NULL,
  amount            DECIMAL(20,2) NOT NULL,
  currency          VARCHAR(10) NOT NULL DEFAULT 'USD',
  status            ENUM('pending','completed','rejected') NOT NULL DEFAULT 'pending',
  date              VARCHAR(50) DEFAULT NULL,
  time              VARCHAR(20) DEFAULT NULL,
  tx_id             VARCHAR(100) NOT NULL UNIQUE,
  note              TEXT DEFAULT NULL,
  rejection_reason  TEXT DEFAULT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Holdings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS holdings (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL,
  type            ENUM('stock','crypto') NOT NULL,
  symbol          VARCHAR(20) NOT NULL,
  name            VARCHAR(100) NOT NULL,
  color           VARCHAR(20) DEFAULT NULL,
  quantity        DECIMAL(30,10) NOT NULL DEFAULT 0,
  avg_buy_price   DECIMAL(20,8) NOT NULL DEFAULT 0,
  current_price   DECIMAL(20,8) NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Profit Overview ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profit_overview (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  user_id   INT NOT NULL,
  period    VARCHAR(50) NOT NULL,
  data      JSON NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Purchases ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchases (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  user_id           INT NOT NULL,
  type              VARCHAR(50) NOT NULL,
  symbol            VARCHAR(20) NOT NULL,
  name              VARCHAR(100) NOT NULL,
  color             VARCHAR(20) DEFAULT NULL,
  quantity          DECIMAL(30,10) NOT NULL,
  price             DECIMAL(20,8) NOT NULL,
  total_cost        DECIMAL(20,8) NOT NULL,
  date              VARCHAR(50) DEFAULT NULL,
  time              VARCHAR(20) DEFAULT NULL,
  tx_id             VARCHAR(100) NOT NULL UNIQUE,
  status            ENUM('pending','completed','rejected') NOT NULL DEFAULT 'pending',
  rejection_reason  TEXT DEFAULT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Notifications ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  title       VARCHAR(255) NOT NULL,
  message     TEXT NOT NULL,
  type        VARCHAR(50) DEFAULT 'info',
  is_read     TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── User Notifications ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_notifications (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  title         VARCHAR(255) NOT NULL,
  message       TEXT NOT NULL,
  type          VARCHAR(50) DEFAULT 'info',
  is_read       TINYINT(1) NOT NULL DEFAULT 0,
  related_id    VARCHAR(100) DEFAULT NULL,
  related_type  VARCHAR(100) DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Admin Actions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_actions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  admin_id        INT NOT NULL,
  action          VARCHAR(100) NOT NULL,
  target_user_id  INT DEFAULT NULL,
  target_id       VARCHAR(100) DEFAULT NULL,
  details         TEXT DEFAULT NULL,
  timestamp       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);
