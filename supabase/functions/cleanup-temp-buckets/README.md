# Cleanup Temp Buckets

A Supabase Edge Function that automatically cleans up temporary AWS S3 buckets created during NSFW bulk processing jobs in SnapSort.

## Overview

This function manages the lifecycle of temporary S3 buckets by:
- Deleting expired temporary buckets and their contents
- Cleaning up buckets for specific users or jobs
- Updating database records to reflect cleanup status
- Providing flexible cleanup options with safety checks

## Features

- **Automatic Cleanup**: Removes buckets older than specified hours (default: 24h)
- **Selective Cleanup**: Target specific buckets or users
- **Safety Checks**: Prevents deletion of buckets with active processing jobs
- **Batch Operations**: Efficiently deletes objects in batches up to AWS limits
- **Database Sync**: Updates job status in Supabase after cleanup
- **Error Handling**: Comprehensive error reporting and logging

## API Reference

### Endpoint
```
POST /functions/v1/cleanup-temp-buckets
```

### Request Body
```typescript
{
  bucketName?: string;      // Clean specific bucket
  userId?: string;          // Clean all buckets for user  
  olderThanHours?: number;  // Clean buckets older than X hours (default: 24)
  force?: boolean;          // Force cleanup even if job is running
}
```

### Response
```typescript
{
  success: boolean;
  bucketsDeleted: string[];
  errors: string[];
  totalDeleted: number;
  request_id: string;
}
```

## Usage Examples

### Clean all expired buckets
```bash
curl -X POST https://your-project.supabase.co/functions/v1/cleanup-temp-buckets \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Clean specific bucket
```bash
curl -X POST https://your-project.supabase.co/functions/v1/cleanup-temp-buckets \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"bucketName": "nsfw-bulk-12345678-1752571943686"}'
```

### Clean buckets for specific user
```bash
curl -X POST https://your-project.supabase.co/functions/v1/cleanup-temp-buckets \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-uuid-here", "olderThanHours": 12}'
```

### Force cleanup (bypass safety checks)
```bash
curl -X POST https://your-project.supabase.co/functions/v1/cleanup-temp-buckets \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"force": true, "olderThanHours": 1}'
```

## Environment Variables

Required environment variables:

```env
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Supabase Configuration  
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Bucket Naming Convention

The function identifies temporary buckets by these prefixes:
- `nsfw-bulk-*` - Bulk processing buckets
- `nsfw-temp-*` - Temporary processing buckets

Bucket names include timestamps for age-based cleanup: `nsfw-bulk-{userId}-{timestamp}`

## Safety Features

- **Job Status Check**: Prevents deletion of buckets with `processing` status jobs
- **Age Verification**: Only deletes buckets older than specified threshold
- **User Filtering**: Optionally restrict cleanup to specific user's buckets
- **Force Override**: `force` flag bypasses safety checks when needed
- **Comprehensive Logging**: Detailed console output for monitoring

## Database Integration

Updates the `nsfw_bulk_jobs` table:
- Sets `status` to `'cleaned_up'`
- Records `cleaned_up_at` timestamp
- Links cleanup to bucket via `aws_temp_bucket` field

## Deployment

Deploy using Supabase CLI:

```bash
supabase functions deploy cleanup-temp-buckets
```

## Monitoring

The function provides detailed logging:
- 🔍 Discovery phase logs
- 🗑️ Deletion progress indicators  
- ✅ Success confirmations
- ❌ Error details with context
- 📊 Summary statistics

## Error Handling

Common error scenarios:
- **AWS Permission Issues**: Check IAM policies for S3 access
- **Bucket Not Empty**: Function handles this by emptying buckets first
- **Database Connection**: Verify Supabase credentials and network access
- **Rate Limiting**: Built-in batch processing respects AWS limits

## Performance

- Processes up to 1000 objects per batch (AWS limit)
- Efficient pagination for large buckets
- Parallel processing where possible
- Minimal database queries with targeted updates

## Security

- CORS enabled for web client access
- Service role authentication required
- Request ID tracking for audit trails
- Input validation and sanitization

---

**SnapSort © 2025** - Intelligent Photo Organization