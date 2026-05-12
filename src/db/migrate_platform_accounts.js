/**
 * Migration: Add missing columns to platform_accounts
 *
 * Adds: iban, sort_code, currency_accepted, coin_symbol, qr_code_image
 *
 * Run once:  node src/db/migrate_platform_accounts.js
 */

const pool = require('./pool');

const COLUMNS = [
  { name: 'iban',               def: 'VARCHAR(100) DEFAULT NULL AFTER my_address' },
  { name: 'sort_code',          def: 'VARCHAR(50)  DEFAULT NULL AFTER iban' },
  { name: 'currency_accepted',  def: 'VARCHAR(50)  DEFAULT NULL AFTER sort_code' },
  { name: 'coin_symbol',        def: 'VARCHAR(20)  DEFAULT NULL AFTER currency_accepted' },
  { name: 'qr_code_image',      def: 'MEDIUMTEXT   DEFAULT NULL AFTER coin_symbol' },
];

async function run() {
  try {
    // Check which columns already exist
    const [existing] = await pool.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'platform_accounts'`
    );
    const existingNames = new Set(existing.map(r => r.COLUMN_NAME));

    for (const col of COLUMNS) {
      if (existingNames.has(col.name)) {
        console.log(`  ✓ ${col.name} already exists — skipping`);
        continue;
      }
      await pool.query(
        `ALTER TABLE platform_accounts ADD COLUMN \`${col.name}\` ${col.def}`
      );
      console.log(`  + Added column: ${col.name}`);
    }

    console.log('\nMigration complete.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

run();
