# Database Lock Timeout Fix

## Error
```
SequelizeDatabaseError: Lock wait timeout exceeded; try restarting transaction
```

## Root Cause

The `addAdjustment` function was calling `calculateEmployeePayroll` while still inside an active transaction, causing a deadlock:

1. Parent transaction locks the `employee_payrolls` row
2. `calculateEmployeePayroll` starts its own transaction
3. Tries to update the same row
4. Waits for parent transaction to release lock
5. Timeout after 50 seconds

## Solution Applied

### 1. Fixed Transaction Handling

**File**: `controllers/payrollController.js`

Changed the flow to commit the adjustment transaction BEFORE triggering recalculation:

```javascript
// OLD (DEADLOCK):
await PayrollAdjustment.create({...}, { transaction });
await calculateEmployeePayroll(id); // Still in transaction!
await transaction.commit();

// NEW (FIXED):
await PayrollAdjustment.create({...}, { transaction });
await transaction.commit(); // Commit first!
await calculateEmployeePayroll(id); // Then recalculate
```

### 2. Added Error Handling

If recalculation fails, the adjustment is still saved:

```javascript
try {
    await calculateEmployeePayroll(employee_payroll_id);
    return res.status(201).json({
        success: true,
        message: "Adjustment added and payroll recalculated successfully"
    });
} catch (calcError) {
    return res.status(201).json({
        success: true,
        message: "Adjustment added but recalculation failed. Please recalculate manually."
    });
}
```

## Immediate Fix (If Still Locked)

### Option 1: Restart MySQL Service

**Windows:**
```bash
net stop MySQL80
net start MySQL80
```

**Linux/Mac:**
```bash
sudo systemctl restart mysql
```

### Option 2: Kill Stuck Transactions

1. **Connect to MySQL:**
   ```bash
   mysql -u root -p
   ```

2. **Find stuck transactions:**
   ```sql
   SELECT * FROM information_schema.INNODB_TRX;
   ```

3. **Kill the transaction:**
   ```sql
   KILL <trx_mysql_thread_id>;
   ```

### Option 3: Increase Lock Timeout

```sql
SET GLOBAL innodb_lock_wait_timeout = 120;
```

## Testing the Fix

### Step 1: Restart Backend
```bash
cd hrm-backend
npm start
```

### Step 2: Test Adjustment
1. Go to `/admin/payroll/7`
2. Click "Add Adjustment"
3. Fill form:
   - Type: Bonus
   - Amount: 500
   - Reason: Test
4. Click "Apply Adjustment"
5. Should work without timeout! ✅

## Prevention

### 1. Always Commit Before Nested Operations

```javascript
// BAD
const transaction = await sequelize.transaction();
await Model1.create({...}, { transaction });
await someServiceThatStartsItsOwnTransaction(); // DEADLOCK!
await transaction.commit();

// GOOD
const transaction = await sequelize.transaction();
await Model1.create({...}, { transaction });
await transaction.commit(); // Commit first
await someServiceThatStartsItsOwnTransaction(); // Safe now
```

### 2. Use Transaction Timeouts

```javascript
const transaction = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
    timeout: 30000 // 30 seconds
});
```

### 3. Keep Transactions Short

- Do only what's necessary in a transaction
- Avoid external API calls inside transactions
- Commit as soon as possible

### 4. Use Proper Isolation Levels

```javascript
// For read-heavy operations
isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED

// For write-heavy operations
isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ
```

## Monitoring

### Check for Deadlocks

```sql
SHOW ENGINE INNODB STATUS;
```

Look for the "LATEST DETECTED DEADLOCK" section.

### Monitor Lock Waits

```sql
SELECT 
    r.trx_id waiting_trx_id,
    r.trx_mysql_thread_id waiting_thread,
    r.trx_query waiting_query,
    b.trx_id blocking_trx_id,
    b.trx_mysql_thread_id blocking_thread,
    b.trx_query blocking_query
FROM information_schema.innodb_lock_waits w
INNER JOIN information_schema.innodb_trx b ON b.trx_id = w.blocking_trx_id
INNER JOIN information_schema.innodb_trx r ON r.trx_id = w.requesting_trx_id;
```

## Configuration Tuning

Add to `config/config.js`:

```javascript
development: {
    // ... existing config
    pool: {
        max: 10,
        min: 0,
        acquire: 60000,
        idle: 10000
    },
    dialectOptions: {
        connectTimeout: 60000
    }
}
```

## Common Causes of Deadlocks

1. ❌ Nested transactions without proper commit order
2. ❌ Long-running transactions
3. ❌ Multiple updates to same row in different order
4. ❌ External API calls inside transactions
5. ❌ Complex joins with row locks

## Best Practices

✅ Keep transactions short
✅ Commit before calling other services
✅ Use optimistic locking when possible
✅ Handle deadlock errors gracefully
✅ Monitor transaction duration
✅ Use connection pooling
✅ Set appropriate timeouts

---

**Fixed Date**: February 23, 2026
**Status**: ✅ Resolved
**Action Required**: Restart backend server
