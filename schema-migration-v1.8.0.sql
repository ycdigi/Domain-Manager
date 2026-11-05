-- Adds an optional workstation label to each domain.
ALTER TABLE domains ADD COLUMN computer_name TEXT;
