/**
 * Migration: Create email_logs table and add email preferences to users
 */
const pool = require('./pool');

async function migrateEmailLogs() {
  const connection = await pool.getConnection();
  
  try {
    console.log('Starting email logs migration...');

    // Create email_logs table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        recipient VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        status ENUM('sent', 'failed') NOT NULL DEFAULT 'sent',
        message_id VARCHAR(255),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_recipient (recipient),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✓ email_logs table created');

    // Add email_notifications_enabled column to users table if it doesn't exist
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users' 
        AND COLUMN_NAME = 'email_notifications_enabled'
    `);

    if (columns.length === 0) {
      await connection.query(`
        ALTER TABLE users 
        ADD COLUMN email_notifications_enabled BOOLEAN DEFAULT TRUE
      `);
      console.log('✓ email_notifications_enabled column added to users table');
    } else {
      console.log('✓ email_notifications_enabled column already exists');
    }

    console.log('Email logs migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateEmailLogs()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error:', err);
      process.exit(1);
    });
}

module.exports = migrateEmailLogs;
