-- ============================================================
-- Migration: Add screenshot column to deposits table
-- ============================================================

ALTER TABLE deposits
  ADD COLUMN screenshot MEDIUMTEXT DEFAULT NULL
    COMMENT 'Base64-encoded payment screenshot uploaded by user at deposit time'
  AFTER note;
