-- Switches the Document Archive storage backend from a Drive service account (which
-- turned out to be unusable — service accounts have no storage quota of their own, so
-- uploading into a personal Gmail Drive folder fails with storageQuotaExceeded) to a
-- Google Apps Script Web App deployed under the real Google account. That script runs
-- as the account owner, so it has the account's real 15GB quota, and its deployment URL
-- doesn't expire the way an unverified OAuth app's refresh token would (7 days).

ALTER TABLE public.archive_drive_settings
  DROP COLUMN IF EXISTS client_email,
  DROP COLUMN IF EXISTS private_key,
  ADD COLUMN IF NOT EXISTS script_url TEXT,
  ADD COLUMN IF NOT EXISTS shared_secret TEXT;
