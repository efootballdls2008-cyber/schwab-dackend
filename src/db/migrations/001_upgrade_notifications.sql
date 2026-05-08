-- ============================================================
-- Notification System Upgrade Migration
-- ============================================================

USE schwab_db;

-- ── Drop existing notification tables to recreate with new structure ──
DROP TABLE IF EXISTS admin_notifications;
DROP TABLE IF EXISTS user_notifications;
DROP TABLE IF EXISTS notifications;

-- ── Enhanced User Notifications ──────────────────────────────
CREATE TABLE user_notifications (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  title        VARCHAR(255) NOT NULL,
  message      TEXT NOT NULL,
  type         ENUM('deposit','withdrawal','trade','order','bot_open','bot_close','take_profit','stop_loss','system','security','price_alert','bot_activity','profit_loss') NOT NULL DEFAULT 'system',
  category     ENUM('trading','wallet','bot_activity','profit_loss','system_alerts') NOT NULL DEFAULT 'system_alerts',
  priority     ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  related_id   VARCHAR(100) DEFAULT NULL,
  related_type VARCHAR(50) DEFAULT NULL,
  metadata     JSON DEFAULT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_notifications_user_id (user_id),
  INDEX idx_user_notifications_type (type),
  INDEX idx_user_notifications_category (category),
  INDEX idx_user_notifications_created_at (created_at),
  INDEX idx_user_notifications_is_read (is_read)
);

-- ── Enhanced Admin Notifications ─────────────────────────────
CREATE TABLE admin_notifications (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  title        VARCHAR(255) NOT NULL,
  message      TEXT NOT NULL,
  type         ENUM('user_deposit','user_withdrawal','buy_stocks','buy_crypto','bot_activation','bot_position_open','bot_position_close','user_pnl','suspicious_activity','failed_transaction','system_alert','user_registration') NOT NULL DEFAULT 'system_alert',
  priority     ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  related_id   VARCHAR(100) DEFAULT NULL,
  related_type VARCHAR(50) DEFAULT NULL,
  user_id      INT DEFAULT NULL,
  metadata     JSON DEFAULT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_admin_notifications_type (type),
  INDEX idx_admin_notifications_created_at (created_at),
  INDEX idx_admin_notifications_is_read (is_read),
  INDEX idx_admin_notifications_user_id (user_id)
);

-- ── Notification Settings ────────────────────────────────────
CREATE TABLE notification_settings (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  user_id               INT NOT NULL,
  email_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  in_app_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Email preferences
  email_deposits        BOOLEAN NOT NULL DEFAULT TRUE,
  email_withdrawals     BOOLEAN NOT NULL DEFAULT TRUE,
  email_trades          BOOLEAN NOT NULL DEFAULT TRUE,
  email_bot_activity    BOOLEAN NOT NULL DEFAULT TRUE,
  email_profit_loss     BOOLEAN NOT NULL DEFAULT TRUE,
  email_security        BOOLEAN NOT NULL DEFAULT TRUE,
  email_system          BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- In-app preferences
  app_deposits          BOOLEAN NOT NULL DEFAULT TRUE,
  app_withdrawals       BOOLEAN NOT NULL DEFAULT TRUE,
  app_trades            BOOLEAN NOT NULL DEFAULT TRUE,
  app_bot_activity      BOOLEAN NOT NULL DEFAULT TRUE,
  app_profit_loss       BOOLEAN NOT NULL DEFAULT TRUE,
  app_security          BOOLEAN NOT NULL DEFAULT TRUE,
  app_system            BOOLEAN NOT NULL DEFAULT TRUE,
  app_price_alerts      BOOLEAN NOT NULL DEFAULT TRUE,
  
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_settings (user_id)
);

-- ── Admin Notification Settings ──────────────────────────────
CREATE TABLE admin_notification_settings (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  admin_id              INT NOT NULL,
  email_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Email preferences for admin alerts
  email_deposits        BOOLEAN NOT NULL DEFAULT TRUE,
  email_withdrawals     BOOLEAN NOT NULL DEFAULT TRUE,
  email_trades          BOOLEAN NOT NULL DEFAULT TRUE,
  email_bot_activity    BOOLEAN NOT NULL DEFAULT TRUE,
  email_suspicious      BOOLEAN NOT NULL DEFAULT TRUE,
  email_failed_tx       BOOLEAN NOT NULL DEFAULT TRUE,
  email_user_reg        BOOLEAN NOT NULL DEFAULT FALSE,
  
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_admin_settings (admin_id)
);

-- ── Create default notification settings for existing users ──
INSERT INTO notification_settings (user_id)
SELECT id FROM users WHERE role = 'Member'
ON DUPLICATE KEY UPDATE user_id = user_id;

INSERT INTO admin_notification_settings (admin_id)
SELECT id FROM users WHERE role = 'Admin'
ON DUPLICATE KEY UPDATE admin_id = admin_id;