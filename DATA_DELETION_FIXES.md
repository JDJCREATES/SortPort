# Data Deletion Fixes

## Issues Fixed

### 1. UI Bug: Double Modal Showing After Data Clear
**Problem**: After clearing data, the clear data modal was showing again due to duplicate handling
**Root Cause**: Both `settings.tsx` and `DataManagementSection.tsx` were showing clear data modals
**Solution**: Removed duplicate modal logic from `settings.tsx`, now handled entirely by `DataManagementSection.tsx`

**Files Changed**:
- `app/(tabs)/settings.tsx` - Simplified `handleClearData` to be a no-op since `DataManagementSection` handles everything

### 2. Missing Virtual Image Cleanup 
**Problem**: User data deletion was not cleaning up `virtual_image` table entries
**Root Cause**: Virtual images were not included in the deletion processes
**Solution**: Added `virtual_image` table to both user data deletion functions

**Files Changed**:
- `supabase/functions/delete-user-account/index.ts` - Added `virtual_image` to `existingTables` array
- `contexts/AppContext.tsx` - Added `virtual_image` to `tablesToClear` in `clearUserDatabaseData`

### 3. Missing Junction Table Cleanup
**Problem**: The new `bulk_job_virtual_images` junction table wasn't being cleaned up during user data deletion
**Root Cause**: Junction table was added recently but not included in cleanup processes  
**Solution**: Added junction table cleanup logic

**Files Changed**:
- `supabase/functions/delete-user-account/index.ts` - Added `bulk_job_virtual_images` to monitoring
- `contexts/AppContext.tsx` - Added junction table cleanup in `clearUserDatabaseData`

### 4. Credit Balance Reset Bug ✨ **NEW**
**Problem**: Credit balance was being reset to 0 in UI after clearing data, even though credits remained in database
**Root Cause**: `resetAppState` function was hardcoding credit balance to 0 instead of preserving actual balance
**Solution**: Modified `resetAppState` to fetch and preserve user's actual credit balance during data clearing

**Files Changed**:
- `contexts/AppContext.tsx` - Updated `resetAppState` to fetch current credit balance and preserve it during data clearing
- `contexts/AppContext.tsx` - Made `clearAllAppData` properly await the async `resetAppState`

**Important Distinction**:
- **Data Clear**: Preserves credit balance (credits belong to user account, not app data)
- **Account Delete**: Resets credit balance to 0 (entire account is being deleted)

## Data Tables Now Properly Cleaned

### User Data Deletion (Clear Data) Now Cleans:
1. ✅ `albums` - User's sorted photo albums
2. ✅ `moderated_folders` - NSFW folder settings  
3. ✅ `moderated_images` - Individual NSFW image flags
4. ✅ `nsfw_bulk_jobs` - Bulk NSFW processing jobs
5. ✅ `sort_sessions` - AI sorting session history
6. ✅ `virtual_image` - **NEW**: Virtual image metadata and AI analysis
7. ✅ `nsfw_bulk_results` - Bulk processing results (via job_id lookup)
8. ✅ `bulk_job_virtual_images` - **NEW**: Job-image relationships (via job_id lookup)

### Account Deletion (Delete Account) Now Monitors:
1. ✅ `albums`
2. ✅ `credit_transactions`
3. ✅ `moderated_folders` 
4. ✅ `moderated_images`
5. ✅ `nsfw_bulk_jobs`
6. ✅ `nsfw_bulk_results`
7. ✅ `sort_sessions`
8. ✅ `user_credits`
9. ✅ `virtual_image` - **NEW**: Virtual images are now included
10. ✅ `bulk_job_virtual_images` - **NEW**: Junction table is now monitored

## Database Auto-Cleanup

The `bulk_job_virtual_images` junction table also has comprehensive auto-cleanup mechanisms:

1. **Triggers**: Automatically clean up when parent records are deleted
2. **Scheduled Jobs**: Daily cleanup of orphaned records (via pg_cron)
3. **Manual Function**: `cleanup_orphaned_bulk_job_virtual_images()` for manual cleanup

## Testing

### To Test UI Fix:
1. Go to Settings → Data Management
2. Click "Clear All Data" 
3. Confirm in modal
4. ✅ Should see success message only once (no double modal)

### To Test Virtual Image Cleanup:
1. Create some virtual images via bulk upload
2. Clear data or delete account
3. ✅ Check that `virtual_image` table is empty for the user
4. ✅ Check that `bulk_job_virtual_images` relationships are removed

### To Test Credit Balance Fix: ✨ **NEW**
1. Purchase some credits or have a positive credit balance
2. Go to Settings → Data Management
3. Click "Clear All Data" and confirm
4. ✅ Credit balance should remain the same in UI (not reset to 0)
5. ✅ Credit balance should be preserved in database
6. For comparison: Delete Account should reset credits to 0 (expected behavior)

## Architecture Impact

These fixes ensure that:
- Virtual images are properly cleaned up during user data deletion
- The new ID-based virtual image tracking system maintains data integrity
- Junction table relationships are automatically maintained
- Users get a clean, bug-free data deletion experience

The virtual image ecosystem now has complete data lifecycle management from creation through deletion.
