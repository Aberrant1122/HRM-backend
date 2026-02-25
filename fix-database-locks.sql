-- Fix Database Lock Issues
-- Run this if you're experiencing lock timeout errors

-- 1. Show current locks
SELECT * FROM information_schema.INNODB_LOCKS;

-- 2. Show lock waits
SELECT * FROM information_schema.INNODB_LOCK_WAITS;

-- 3. Show running transactions
SELECT * FROM information_schema.INNODB_TRX;

-- 4. Kill long-running transactions (BE CAREFUL!)
-- First, identify the problematic transaction ID from above queries
-- Then run: KILL <trx_mysql_thread_id>;

-- 5. Check current transaction isolation level
SELECT @@transaction_isolation;

-- 6. Increase lock wait timeout (temporary fix)
SET GLOBAL innodb_lock_wait_timeout = 120;

-- 7. Show current timeout value
SHOW VARIABLES LIKE 'innodb_lock_wait_timeout';

-- 8. Check for deadlocks
SHOW ENGINE INNODB STATUS;
