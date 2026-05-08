/**
 * One-time admin seed script.
 * Run: node src/db/seed-admin.js
 *
 * Creates or updates the admin account using ADMIN_SEED_EMAIL and
 * ADMIN_SEED_PASSWORD from .env. Safe to run multiple times — if the
 * account already exists it updates the password and ensures role=Admin.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function seedAdmin() {
  const email     = process.env.ADMIN_SEED_EMAIL    || 'Paxfulexchangecompany@gmail.com';
  const password  = process.env.ADMIN_SEED_PASSWORD || 'admin@5555';
  const firstName = process.env.ADMIN_SEED_FIRST_NAME || 'Admin';
  const lastName  = process.env.ADMIN_SEED_LAST_NAME  || 'Schwab';

  console.log(`[seed-admin] Using email: ${email}`);

  const hash = await bcrypt.hash(password, 12);

  // Check if user already exists (by email)
  const [[existing]] = await pool.query(
    'SELECT id, role FROM users WHERE email = ?',
    [email.toLowerCase()]
  );

  if (existing) {
    // Update password and ensure role is Admin
    await pool.query(
      "UPDATE users SET password = ?, role = 'Admin' WHERE id = ?",
      [hash, existing.id]
    );
    console.log(`[seed-admin] Updated existing user #${existing.id} → role=Admin, password reset.`);
  } else {
    // Create fresh admin account
    const [result] = await pool.query(
      `INSERT INTO users (email, password, first_name, last_name, role)
       VALUES (?, ?, ?, ?, 'Admin')`,
      [email.toLowerCase(), hash, firstName, lastName]
    );
    console.log(`[seed-admin] Created new admin account #${result.insertId}: ${email}`);
  }

  console.log('[seed-admin] Done. You can now log in with:');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  process.exit(0);
}

seedAdmin().catch(err => {
  console.error('[seed-admin] Error:', err.message);
  process.exit(1);
});
