# Issue #65 Fix Summary

## Problem
The `getUserSessions(userId)` method was returning **all sessions** instead of filtering by the specified `userId`. This was a **data isolation vulnerability** that allowed users to see sessions belonging to other users.

## Root Causes

### 1. Missing Database Schema
- The `sessions` table lacked a `user_id` column
- The `tasks` table lacked a `user_id` column

### 2. Incorrect Query Logic
- `getUserSessions()` retrieved the user object but **ignored the userId** in the query
- The method returned all sessions regardless of user

### 3. Session/Task Creation Issues
- Session and task creation didn't store `user_id`

## Solution Implemented

### 1. Database Schema Changes

#### SQLite (data-store.ts)
- Added `user_id TEXT` column to `sessions` table
- Added `user_id TEXT` column to `tasks` table
- Added `app TEXT` column to `tasks` table (was missing)
- Created indexes: `idx_sessions_user_id`, `idx_tasks_user_id`

#### PostgreSQL (postgres-store.ts)
- Migration files created for existing databases
- `migrations/005_add_user_id_columns.sql` (SQLite)
- `migrations/005_add_user_id_columns.postgres.sql` (PostgreSQL)

### 2. Fixed getUserSessions() Implementation

#### Before:
```typescript
// Retrieved user but didn't use userId in query ❌
const user = await this.getUser(userId);
const result = await client.query(
  `SELECT s.* FROM sessions s
   WHERE s.session_id IN (
     SELECT DISTINCT session_id FROM tasks
   )`
);
```

#### After:
```typescript
// Properly filter by userId ✅
const result = await client.query(
  `SELECT s.* FROM sessions s
   WHERE s.user_id = $1
   ORDER BY s.last_active_at DESC
   LIMIT 100`,
  [userId]
);
```

**Also removed unnecessary user existence check** - sessions can exist without user records.

### 3. Updated Session & Task Creation

**Design Decision (After User Discussion)**:
Following user feedback, we chose **Scheme 1**: Require callers to explicitly provide userId. No automatic extraction from sessionId.

#### Added `userId` to Interfaces:
- `Task.userId?: string`
- `Session.userId?: string`

#### Updated Methods:
- `upsertSession(sessionId, metadata?, userId?)` - Uses provided userId directly
- `createTask(taskData)` - Uses taskData.userId directly
- **No extraction logic** - simpler, more explicit, better separation of concerns

#### Why This Approach?
1. ✅ **Explicit is better than implicit** - No hidden string parsing logic
2. ✅ **Decoupled** - sessionId format doesn't matter
3. ✅ **Clear responsibility** - Caller owns providing userId
4. ✅ **Type-safe** - TypeScript ensures userId is passed where needed

### 4. Updated Data Mapping

- `mapDbTaskToTask()` - Now maps `user_id` field
- `getSession()` - Now returns `userId` field
- `getUserSessions()` - Now returns sessions with `userId` field

## Testing

Created comprehensive test suite: `tests/unit/session-isolation.test.ts`

### Test Coverage:
- ✅ Users only see their own sessions
- ✅ Empty result for non-existent users
- ✅ Regular agent sessions without userId handled correctly
- ✅ Tasks associated with provided userId
- ✅ Handles simple userIds (no dashes)
- ✅ Handles complex userIds (with dashes)
- ✅ Session creation with explicit userId
- ✅ Query sessions by userId correctly

**All 8 tests passing ✅**

## Migration Strategy

### For New Databases:
- Schema automatically includes `user_id` columns
- No migration needed

### For Existing Databases:
1. Run migration scripts:
   ```bash
   # SQLite
   sqlite3 database.db < migrations/005_add_user_id_columns.sql

   # PostgreSQL
   psql database < migrations/005_add_user_id_columns.postgres.sql
   ```

2. Migration automatically:
   - Adds `user_id` columns to `sessions` and `tasks`
   - Creates indexes for performance
   - **Backfills Soul Agent sessions** by parsing session_id:
     ```sql
     UPDATE sessions
     SET user_id = SUBSTRING(session_id FROM 'soul-[^-]+-([^-]+)-')
     WHERE session_id LIKE 'soul-%-%-%'
     ```

3. Regular agent sessions will have `user_id = NULL` (acceptable)
   - Future regular agent sessions should provide explicit userId

## Backward Compatibility

- ✅ Existing sessions without `user_id` continue to work
- ✅ `userId` is optional in interfaces (can be NULL)
- ✅ APIs that don't provide userId still function
- ⚠️ **Security Note**: Multi-user environments should apply migration and ensure userId is passed

## Files Changed

### Core Implementation:
- `src/core/database/data-store.ts`
  - Updated schema with `user_id` columns
  - Fixed `getUserSessions()` query
  - Updated `upsertSession()`, `createTask()`, `getSession()`
  - **No extraction logic** - simpler, more explicit

- `src/core/database/postgres-store.ts`
  - Fixed `getUserSessions()` query
  - Updated `upsertSession()`, `createTask()`, `mapDbTaskToTask()`
  - **No extraction logic** - simpler, more explicit

### Migration Files:
- `migrations/005_add_user_id_columns.sql`
- `migrations/005_add_user_id_columns.postgres.sql`

### Tests:
- `tests/unit/session-isolation.test.ts` (new file)

## Impact Assessment

### Security:
- ✅ **FIXED**: Data isolation vulnerability
- ✅ Users can now only see their own sessions/tasks
- ✅ Proper multi-user data separation

### Performance:
- ✅ New indexes on `user_id` improve query performance
- ✅ Query now uses indexed column instead of subquery

### Code Quality:
- ✅ **Simpler** - No complex string parsing
- ✅ **More explicit** - Clear what data is being stored
- ✅ **Better separation of concerns** - Callers provide userId

### Compatibility:
- ✅ Backward compatible (optional fields)
- ⚠️ Callers need to provide userId for proper isolation
- ⚠️ Migration required for existing production databases

## Verification

Run tests:
```bash
npm test -- tests/unit/session-isolation.test.ts
```

Expected output:
```
Test Suites: 1 passed, 1 total
Tests: 8 passed, 8 total
```

## Design Discussion

### Initial Approach (Rejected)
Tried to extract userId from sessionId string format:
```typescript
// ❌ Complex parsing logic
extractUserIdFromSession(sessionId) {
  // Parse soul-{soulId}-{userId}-{threadId}
  // Handle dashes in userId...
  // Handle dashes in soulId...
  // What if format changes??
}
```

**Problems:**
- Implicit coupling to sessionId format
- Fragile and complex
- Hard to maintain

### Final Approach (Accepted)
Require explicit userId:
```typescript
// ✅ Simple and clear
upsertSession(sessionId, metadata, userId) {
  // Just use userId as-is
}

createTask({ sessionId, userId, ... }) {
  // Just use userId as-is
}
```

**Benefits:**
- Explicit and clear
- No format assumptions
- Easier to understand
- Better separation of concerns

## Next Steps

1. **For Development:**
   - Changes ready in feature branch
   - All tests passing
   - Ready for code review

2. **For Production Deployment:**
   - Review migration scripts
   - Test migration on staging database
   - Update Soul Agent code to pass userId
   - Schedule deployment window
   - Run migration scripts
   - Verify session isolation in production

3. **For Callers (Breaking Change):**
   - **Important**: Code that calls `upsertSession()` or `createTask()` must now provide `userId`
   - Update Soul Agent API steps to pass userId
   - Update any other code that creates tasks/sessions
