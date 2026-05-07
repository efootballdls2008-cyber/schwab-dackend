/**
 * One-time migration: add related_id and related_type columns to user_notifications.
 * Run with: node src/db/alter_user_notifications.js
 */
require('dotenv').config();
const pool = require('./pool');

async function run() {
  const conn = await pool.getConnection();
  try {
    // Add related_id if not exists
    await conn.query(`
      ALTER TABLE user_notifications
        ADD COLUMN IF NOT EXISTS related_id   VARCHAR(100) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS related_type VARCHAR(100) DEFAULT NULL
    `).catch(() => {
      // MySQL < 8.0 doesn't support IF NOT EXISTS on ALTER — try individually
    });
    console.log('[alter] user_notifications updated successfully.');
  } catch (err) {
    // Try column-by-column for older MySQL
    try {
      await conn.query('ALTER TABLE user_notifications ADD COLUMN related_id VARCHAR(100) DEFAULT NULL').catch(() => {});
      await conn.query('ALTER TABLE user_notifications ADD COLUMN related_type VARCHAR(100) DEFAULT NULL').catch(() => {});
      console.log('[alter] user_notifications columns added (fallback).');
    } catch (e) {
      console.error('[alter] Error:', e.message);
    }
  } finally {
    conn.release();
    process.exit(0);
  }
}

run();
