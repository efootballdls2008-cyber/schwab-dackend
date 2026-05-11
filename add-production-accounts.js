/**
 * Add Production Platform Accounts Script
 * Run after migration: RAILWAY_MYSQL_PASSWORD=your_password node add-production-accounts.js
 */

const mysql = require('mysql2/promise');

// Railway Production Database Configuration
const RAILWAY_CONFIG = {
  host: 'mysql-production-b71f.up.railway.app',
  port: 3306,
  database: 'railway',
  user: 'root',
  password: process.env.RAILWAY_MYSQL_PASSWORD || 'YOUR_RAILWAY_PASSWORD_HERE',
  ssl: {
    rejectUnauthorized: false
  }
};

// ⚠️ IMPORTANT: Replace these with your REAL production account details
const PRODUCTION_ACCOUNTS = [
  {
    account_name: 'Charles Schwab Production Bank',
    payment_method: 'bank_transfer',
    bank_name: 'Charles Schwab Bank',
    account_number: 'YOUR_REAL_ACCOUNT_NUMBER',
    routing_number: 'YOUR_REAL_ROUTING_NUMBER',
    account_type: 'Business Checking',
    swift_code: 'SCHBUS33',
    assigned_to: 'deposit',
    is_default: 1,
    status: 'active'
  },
  {
    account_name: 'Charles Schwab Wire Transfer',
    payment_method: 'wire_transfer',
    bank_name: 'Charles Schwab Bank',
    account_number: 'YOUR_REAL_WIRE_ACCOUNT',
    routing_number: 'YOUR_REAL_WIRE_ROUTING',
    swift_code: 'SCHBUS33',
    bank_address: 'Your Bank Address Here',
    assigned_to: 'deposit',
    is_default: 0,
    status: 'active'
  },
  {
    account_name: 'Charles Schwab Crypto Wallet',
    payment_method: 'crypto',
    bank_name: '',
    account_number: '',
    wallet_address: 'YOUR_REAL_PRODUCTION_WALLET_ADDRESS',
    network: 'ERC-20',
    assigned_to: 'deposit',
    is_default: 0,
    status: 'active'
  }
];

async function addProductionAccounts() {
  console.log('🏦 Adding Production Platform Accounts...');
  console.log(`📡 Connecting to: ${RAILWAY_CONFIG.host}:${RAILWAY_CONFIG.port}`);
  
  let connection;
  
  try {
    // Create connection
    connection = await mysql.createConnection(RAILWAY_CONFIG);
    console.log('✅ Connected to Railway MySQL database');
    
    // Check if accounts already exist
    const [existingAccounts] = await connection.query('SELECT COUNT(*) as count FROM platform_accounts');
    if (existingAccounts[0].count > 0) {
      console.log(`⚠️  Found ${existingAccounts[0].count} existing platform accounts.`);
      console.log('Do you want to add more accounts or replace existing ones?');
      console.log('This script will add new accounts without removing existing ones.');
    }
    
    // Add each production account
    for (const account of PRODUCTION_ACCOUNTS) {
      try {
        // Check if account with same name already exists
        const [existing] = await connection.query(
          'SELECT id FROM platform_accounts WHERE account_name = ?',
          [account.account_name]
        );
        
        if (existing.length > 0) {
          console.log(`⏭️  SKIP: Account "${account.account_name}" already exists`);
          continue;
        }
        
        // Insert new account
        const [result] = await connection.query(`
          INSERT INTO platform_accounts (
            account_name, payment_method, bank_name, account_number, 
            routing_number, account_type, swift_code, bank_address,
            wallet_address, network, assigned_to, is_default, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          account.account_name,
          account.payment_method,
          account.bank_name || null,
          account.account_number || null,
          account.routing_number || null,
          account.account_type || null,
          account.swift_code || null,
          account.bank_address || null,
          account.wallet_address || null,
          account.network || null,
          account.assigned_to,
          account.is_default,
          account.status
        ]);
        
        console.log(`✅ Added: ${account.account_name} (ID: ${result.insertId})`);
        
      } catch (err) {
        console.error(`❌ Failed to add ${account.account_name}:`, err.message);
      }
    }
    
    // Show final results
    console.log('🔍 Final platform accounts:');
    const [finalAccounts] = await connection.query(`
      SELECT id, account_name, payment_method, bank_name, account_number, 
             wallet_address, network, assigned_to, is_default, status 
      FROM platform_accounts 
      ORDER BY is_default DESC, created_at ASC
    `);
    
    finalAccounts.forEach(acc => {
      const details = acc.payment_method === 'crypto' 
        ? `Wallet: ${acc.wallet_address?.slice(0, 10)}...`
        : `Bank: ${acc.bank_name}, Account: ${acc.account_number}`;
      
      console.log(`   ${acc.is_default ? '⭐' : '📋'} ${acc.id}: ${acc.account_name}`);
      console.log(`      Method: ${acc.payment_method} | ${details}`);
      console.log(`      Status: ${acc.status} | Assigned: ${acc.assigned_to}`);
    });
    
    console.log('');
    console.log('🎉 Production Platform Accounts Setup Complete!');
    console.log('');
    console.log('⚠️  IMPORTANT REMINDERS:');
    console.log('1. Verify all account details are correct');
    console.log('2. Test deposit flow with these accounts');
    console.log('3. Update account details if needed via admin panel');
    console.log('4. Ensure wallet addresses are for production networks');
    
  } catch (error) {
    console.error('❌ Failed to add production accounts:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Check if password is provided
if (!process.env.RAILWAY_MYSQL_PASSWORD && RAILWAY_CONFIG.password === 'YOUR_RAILWAY_PASSWORD_HERE') {
  console.error('❌ Railway MySQL password not provided!');
  console.error('');
  console.error('Please run with:');
  console.error('RAILWAY_MYSQL_PASSWORD=your_password node add-production-accounts.js');
  console.error('');
  console.error('⚠️  BEFORE RUNNING: Edit this file and replace placeholder account details with REAL production values!');
  process.exit(1);
}

// Check if using placeholder values
const hasPlaceholders = PRODUCTION_ACCOUNTS.some(acc => 
  acc.account_number?.includes('YOUR_REAL') || 
  acc.wallet_address?.includes('YOUR_REAL')
);

if (hasPlaceholders) {
  console.error('❌ Placeholder values detected!');
  console.error('');
  console.error('⚠️  CRITICAL: You must edit add-production-accounts.js and replace:');
  console.error('   - YOUR_REAL_ACCOUNT_NUMBER with actual bank account number');
  console.error('   - YOUR_REAL_ROUTING_NUMBER with actual routing number');
  console.error('   - YOUR_REAL_PRODUCTION_WALLET_ADDRESS with actual crypto wallet');
  console.error('');
  console.error('DO NOT use placeholder values in production!');
  process.exit(1);
}

addProductionAccounts();