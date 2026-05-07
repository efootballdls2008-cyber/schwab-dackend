#!/usr/bin/env node

/**
 * Upsert an admin user (creates or resets password if already exists).
 * Usage: node scripts/create-admin.js <email> <password> <firstName> <lastName>
 * Example: node scripts/create-admin.js admin@schwab.com admin1234 Admin Schwab
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/db/pool');

async function createAdmin() {
  const args = process.argv.slice(2);

  if (args.length < 4) {
    console.error('Usage: node scripts/create-admin.js <email> <password> <firstName> <lastName>');
    console.error('Example: node scripts/create-admin.js admin@schwab.com admin1234 Admin Schwab');
    process.exit(1);
  }

  const [email, password, firstName, lastName] = args;

  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    const memberSince = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    const [[existing]] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);

    if (existing) {
      // Update existing user to Admin + reset password
      await pool.query(
        `UPDATE users SET password = ?, first_name = ?, last_name = ?, role = 'Admin', account_status = 'active' WHERE email = ?`,
        [hashedPassword, firstName, lastName, email]
      );
      console.log(`✅ Admin user updated: ${email}`);
    } else {
      const [result] = await pool.query(
        `INSERT INTO users (email, password, first_name, last_name, role, account_status, member_since, balance, currency)
         VALUES (?, ?, ?, ?, 'Admin', 'active', ?, 0, 'USD')`,
        [email, hashedPassword, firstName, lastName, memberSince]
      );
      // Ensure bot_settings row exists
      await pool.query('INSERT IGNORE INTO bot_settings (user_id) VALUES (?)', [result.insertId]);
      console.log(`✅ Admin user created: ${email} (ID: ${result.insertId})`);
    }

    console.log('');
    console.log('  Credentials:');
    console.log(`    Email    : ${email}`);
    console.log(`    Password : ${password}`);
    console.log('');
    console.log('⚠️  Change the password after first login.');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createAdmin();
