/**
 * Production Migration Script for Railway Database
 * Run: railway run node migrate-production-simple.js
 */

const mysql = require('mysql2/promise');

async function runProductionMigration() {
  console.log('🚀 Starting Railway Production Database Migration...');
  
  // Use Railway environment variables with fallback to public URL
  const config = {
    host: process.env.RAILWAY_TCP_PROXY_DOMAIN || 'turntable.proxy.rlwy.net',
    port: parseInt(process.env.RAILWAY_TCP_PROXY_PORT) || 47995,
    database: process.env.MYSQLDATABASE || 'railway',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || process.env.MYSQL_ROOT_PASSWORD,
  };
  
  console.log(`📡 Connecting to: ${config.host}:${config.port}`);
  
  let connection;
  
  try {
    // Create connection
    connection = await mysql.createConnection(config);
    console.log('✅ Connected to Railway MySQL database');
    
    // Test connection
    await connection.query('SELECT 1');
    console.log('✅ Database connection verified');
    
    // ── ALTER migrations (add columns to existing tables) ────────
    const alterMigrations = [
      // Platform accounts table - add missing columns for deposit flow enhancement
      `ALTER TABLE platform_accounts ADD COLUMN payment_method ENUM('bank_transfer','credit_card','wire_transfer','crypto') NOT NULL DEFAULT 'bank_transfer' AFTER account_name`,
      `ALTER TABLE platform_accounts ADD COLUMN bank_address VARCHAR(500) DEFAULT NULL AFTER swift_code`,
      `ALTER TABLE platform_accounts ADD COLUMN my_address VARCHAR(500) DEFAULT NULL AFTER bank_address`,
      `ALTER TABLE platform_accounts ADD COLUMN wallet_address VARCHAR(500) DEFAULT NULL AFTER my_address`,
      `ALTER TABLE platform_accounts ADD COLUMN network VARCHAR(100) DEFAULT NULL AFTER wallet_address`,
      `ALTER TABLE platform_accounts ADD COLUMN assigned_to ENUM('deposit','buy_crypto','buy_stock','all') NOT NULL DEFAULT 'deposit' AFTER network`,
    ];

    console.log('🔄 Running ALTER migrations...');
    for (const sql of alterMigrations) {
      try {
        await connection.query(sql);
        console.log(`✅ OK: ${sql.slice(0, 80)}...`);
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log(`⏭️  SKIP (already exists): ${sql.slice(0, 60)}...`);
        } else {
          console.error(`❌ ERROR on ALTER: ${err.message}`);
          // Don't exit on column errors, continue with other migrations
        }
      }
    }

    // ── Verify platform_accounts table structure ────────────────
    console.log('🔍 Verifying platform_accounts table structure...');
    const [columns] = await connection.query('DESCRIBE platform_accounts');
    console.log('📋 platform_accounts columns:');
    columns.forEach(col => {
      console.log(`   - ${col.Field}: ${col.Type} ${col.Null === 'YES' ? '(nullable)' : '(required)'}`);
    });

    // ── Check existing platform accounts ─────────────────────────
    console.log('🔍 Checking existing platform accounts...');
    try {
      const [accounts] = await connection.query('SELECT id, account_name, status FROM platform_accounts');
      if (accounts.length > 0) {
        console.log('📋 Existing platform accounts:');
        accounts.forEach(acc => {
          console.log(`   - ${acc.id}: ${acc.account_name} - ${acc.status}`);
        });
      } else {
        console.log('⚠️  No platform accounts found. You should add production accounts after migration.');
      }
    } catch (err) {
      console.log('⚠️  Could not check platform accounts (table may not exist yet)');
    }

    console.log('🎉 Railway Production Migration Completed Successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

runProductionMigration();