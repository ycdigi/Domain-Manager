-- Website maintenance destinations; account tokens remain in encrypted credential storage.
ALTER TABLE websites ADD COLUMN github_push_url TEXT;
ALTER TABLE websites ADD COLUMN wp_login_url TEXT;
