-- ============================================================
-- Migration: Multi-payment-method platform accounts
-- Run this against your existing schwab_db database
-- ============================================================

USE schwab_db;

-- Add payment_method type to distinguish account categories
ALTER TABLE platform_accounts
  ADD COLUMN IF NOT EXISTS payment_method ENUM('bank_transfer','credit_card','wire_transfer','crypto') NOT NULL DEFAULT 'bank_transfer' AFTER account_name;

-- Add assigned_to so admin can control where each account appears
ALTER TABLE platform_accounts
  ADD COLUMN IF NOT EXISTS assigned_to ENUM('deposit','buy_crypto','buy_stock','all') NOT NULL DEFAULT 'deposit' AFTER is_default;

-- Crypto-specific fields
ALTER TABLE platform_accounts
  ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(500) DEFAULT NULL AFTER swift_code;

ALTER TABLE platform_accounts
  ADD COLUMN IF NOT EXISTS network VARCHAR(100) DEFAULT NULL AFTER wallet_address;

-- Address fields
ALTER TABLE platform_accounts
  ADD COLUMN IF NOT EXISTS bank_address VARCHAR(500) DEFAULT NULL AFTER network;

ALTER TABLE platform_accounts
  ADD COLUMN IF NOT EXISTS my_address VARCHAR(500) DEFAULT NULL AFTER bank_address;

-- bank_name / account_number are now nullable (not needed for crypto)
ALTER TABLE platform_accounts
  MODIFY COLUMN bank_name VARCHAR(255) DEFAULT NULL,
  MODIFY COLUMN account_number VARCHAR(100) DEFAULT NULL;
