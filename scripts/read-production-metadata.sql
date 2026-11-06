-- Read-only metadata. Run through an existing authorized database connection.
-- No HR rows, credentials, password hashes or reset tokens are selected.
SELECT VERSION() AS mysql_version,
       @@GLOBAL.log_bin AS binary_logging,
       @@GLOBAL.log_bin_trust_function_creators AS trusted_function_creators,
       @@GLOBAL.sql_mode AS sql_mode;
SHOW GRANTS FOR CURRENT_USER;
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME IN ('role', 'sessionVersion', 'hasEmployeeHistory');
SELECT TRIGGER_NAME, ACTION_TIMING, EVENT_MANIPULATION, DEFINER
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE = 'users';
SELECT name FROM SequelizeMeta ORDER BY name;
