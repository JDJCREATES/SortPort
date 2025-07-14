# Supabase Storage S3 Integration Setup

## The Problem
Your edge function expects `SUPABASE_STORAGE_S3_BUCKET` but Supabase storage isn't configured for S3 integration.

## Two Solutions:

### Option 1: Use Native Supabase Storage (Simpler)
Modify your edge function to use Supabase's native storage instead of S3:

```typescript
// Instead of SUPABASE_STORAGE_S3_BUCKET, use:
const supabaseStorageUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/nsfw-temp-processing`
```

### Option 2: Configure S3 Integration (Recommended)
1. **Go to Supabase Dashboard → Project Settings → Storage**
2. **Enable S3 Integration** with your AWS credentials:
   - AWS Access Key ID
   - AWS Secret Access Key  
   - S3 Bucket Name
   - S3 Region

3. **Set Environment Variables** in Supabase Dashboard → Edge Functions → Environment Variables:
   ```
   SUPABASE_STORAGE_S3_BUCKET=your-s3-bucket-name
   AWS_ACCESS_KEY_ID=your-access-key
   AWS_SECRET_ACCESS_KEY=your-secret-key
   AWS_REGION=your-region
   ```

## Why This Matters
- Your client uploads to Supabase storage
- AWS Rekognition needs S3 URLs to process images
- Without S3 integration, the workflow breaks

## Quick Test
Try creating a simple bucket without S3 first, then add S3 integration later.
