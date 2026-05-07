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
    database: process.env.DB_NAME || 'railway',
    multipleStatements: true,
  });

  let sql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
  // Strip the CREATE DATABASE / USE statements so tables go into the connected DB
  sql = sql.replace(/^CREATE DATABASE.*?;/gim, '').replace(/^USE\s+\S+;/gim, '');
  await conn.query(sql);
  console.log('[migrate] All tables created successfully.');
  await conn.end();
}

migrate().catch((err) => {
  console.error('[migrate] Error:', err.message);
  process.exit(1);
});
