-- Adds an optional opening date for each AdSense account.
-- Run once against an existing database after v1.9.0.
ALTER TABLE adsense_accounts ADD COLUMN opened_date TEXT;
