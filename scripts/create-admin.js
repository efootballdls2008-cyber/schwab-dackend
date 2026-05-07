#!/usr/bin/env node

/**
 * Script to create an admin user
 * Usage: node scripts/create-admin.js <email> <password> <firstName> <lastName>
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/db/pool');

async function createAdmin() {
  const args = process.argv.slice(2);
  
  if (args.length < 4) {
    console.error('Usage: node scripts/create-admin.js <email> <password> <firstName> <lastName>');
    console.error('Example: node scripts/create-admin.js admin@schwab.com admin123 Admin User');
    process.exit(1);
  }

  const [email, password, firstName, lastName] = args;

  try {
    // Check if user already exists
    const [[existing]] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    
    if (existing) {
      console.error(`❌ User with email ${email} already exists`);
      process.exit(1);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create admin user
    const [result] = await pool.query(
      `INSERT INTO users (email, password, first_name, last_name, role, account_status, member_since, balance, currency)
       VALUES (?, ?, ?, ?, 'Admin', 'active', ?, 0, 'USD')`,
      [email, hashedPassword, firstName, lastName, new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })]
    );

    console.log('✅ Admin user created successfully!');
    console.log('');
    console.log('Credentials:');
    console.log(`  Email: ${email}`);
    console.log(`  Password: ${password}`);
    console.log(`  User ID: ${result.insertId}`);
    console.log('');
    console.log('⚠️  Please change the password after first login!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    process.exit(1);
  }
}

createAdmin();
