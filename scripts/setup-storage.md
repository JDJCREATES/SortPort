# Storage Setup Instructions

## Required Storage Bucket

Your SnapSort app needs a storage bucket for temporary image processing. Follow these steps:

### 1. Create the Bucket

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **Storage** in the sidebar
3. Click **"New bucket"**
4. Set these values:
   - **Name**: `nsfw-temp-processing`
   - **Public bucket**: ❌ **Disabled** (keep it private)
   - **Allowed MIME types**: 
     - `image/jpeg`
     - `image/png` 
     - `image/webp`
     - `image/gif`
     - `text/plain`
   - **File size limit**: `10 MB`

### 2. Verify Setup

After creating the bucket, test your app:
1. Open the app
2. Try selecting photo folders
3. The bucket should now be accessible

### 3. Troubleshooting

If you still see bucket errors:
- **Check bucket name**: Must be exactly `nsfw-temp-processing`
- **Verify permissions**: Ensure your app has storage access
- **Check quotas**: Make sure you haven't hit Supabase storage limits

## Why This Bucket?

- **Temporary storage**: Images are uploaded, processed by AWS Rekognition, then deleted
- **Private**: Images are never publicly accessible
- **Auto-cleanup**: Files are automatically removed after processing
- **Size limited**: Prevents abuse with 10MB file limit

## Alternative: Service Role Method

If you have access to your service role key, you could also create buckets programmatically:

```typescript
// Only works with service role permissions
const supabaseAdmin = createClient(url, serviceRoleKey);
await supabaseAdmin.storage.createBucket('nsfw-temp-processing', {
  public: false,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'text/plain'],
  fileSizeLimit: 10485760
});
```
