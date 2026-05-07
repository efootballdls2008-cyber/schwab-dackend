const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'schwab_db',
  user: process.env.DB_USER || 'schwab_user',
  password: process.env.DB_PASSWORD || 'schwab_pass',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
});

pool.on('connection', () => {
  console.log('[DB] New connection established');
});

module.exports = pool;
