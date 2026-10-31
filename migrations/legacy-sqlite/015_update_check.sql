INSERT OR IGNORE INTO app_settings (setting_key, setting_value, data_type, metadata) VALUES
  ('update_check_enabled',  'true',  'boolean', '{"description":"Whether the scheduler checks GitHub for new releases"}'),
  ('latest_version',        '',      'string',  '{"description":"Latest release tag from GitHub e.g. v0.9.0"}'),
  ('update_check_last_run', '',      'string',  '{"description":"ISO timestamp of last successful check"}'),
  ('update_available',      'false', 'boolean', '{"description":"Set true by scheduler when newer version available"}');
