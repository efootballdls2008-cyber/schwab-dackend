/**
 * Migration: create admin_notifications table
 * Run: node src/db/migrate-admin-notifications.js
 */
require('dotenv').config();
const pool = require('./pool');

async function migrate() {
  const sql = `
    CREATE TABLE IF NOT EXISTS admin_notifications (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      title        VARCHAR(255) NOT NULL,
      message      TEXT NOT NULL,
      type         VARCHAR(50) NOT NULL DEFAULT 'info',
      is_read      TINYINT(1) NOT NULL DEFAULT 0,
      related_id   VARCHAR(100) DEFAULT NULL,
      related_type VARCHAR(100) DEFAULT NULL,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  try {
    await pool.query(sql);
    console.log('[migrate] admin_notifications table created (or already exists)');
    process.exit(0);
  } catch (err) {
    console.error('[migrate] Error:', err.message);
    process.exit(1);
  }
}

migrate();
