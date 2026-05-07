/**
 * Run this once to create all tables:
 *   node src/db/migrate.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'schwab_user',
    password: process.env.DB_PASSWORD || 'schwab_pass',
    multipleStatements: true,
  });

  const sql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
  await conn.query(sql);
  console.log('[migrate] All tables created successfully.');
  await conn.end();
}

migrate().catch((err) => {
  console.error('[migrate] Error:', err.message);
  process.exit(1);
});
