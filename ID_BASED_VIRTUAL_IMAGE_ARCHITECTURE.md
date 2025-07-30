# ID-Based Virtual Image Tracking Architecture

## Problem Statement

You were absolutely right - the bulk NSFW processing system was incorrectly trying to track virtual images using file paths instead of database IDs. This caused empty `rekognition_data` fields because the system couldn't reliably match AWS results back to the correct virtual images.

## Root Cause

The original flow was:
1. ✅ Create virtual images with unique database IDs during upload
2. ❌ Store AWS results with S3 file paths
3. ❌ Try to match virtual images by comparing paths
4. ❌ Fail: Paths are unreliable (S3 temp paths vs device paths)
5. ❌ Result: Empty `rekognition_data` fields

## Correct Architecture: ID-Based Tracking

### 1. Database Schema Changes

**New Table: `bulk_job_virtual_images`**
```sql
CREATE TABLE bulk_job_virtual_images (
    id UUID PRIMARY KEY,
    job_id UUID NOT NULL,           -- Links to nsfw_bulk_jobs.id
    virtual_image_id UUID NOT NULL, -- Links to virtual_image.id  
    s3_key TEXT,                    -- S3 key for reference only
    upload_order INTEGER,           -- Position in batch for AWS correlation
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2. Proper Flow: ID-Based Tracking

#### Phase 1: Upload & Virtual Image Creation
```
1. User uploads images → bulk-nsfw-upload
2. Create virtual images with unique IDs → virtual-image-bridge/create  
3. Store job-virtual image relationships by ID → bulk_job_virtual_images table
4. Upload to S3 temp bucket for AWS processing
```

#### Phase 2: AWS Processing & Results
```
1. AWS processes images in S3 bucket order
2. Results come back with S3 keys and positions
3. Map S3 positions to upload_order in bulk_job_virtual_images
4. Update virtual images by database ID (not path!)
```

#### Phase 3: Update Virtual Images
```
1. Look up virtual_image_ids from bulk_job_virtual_images by job_id + upload_order
2. Call virtualImageManager.updateWithRekognitionData(virtual_image_id, data)
3. Populate rekognition_data field correctly
```

### 3. Key Changes Made

**A. Virtual Image Bridge Interface Updates**
```typescript
// OLD: Path-based matching
interface UpdateVirtualImagesRequest {
  results: {
    imagePath: string  // ❌ Unreliable
    isNsfw: boolean
    // ...
  }[]
}

// NEW: ID-based matching  
interface UpdateVirtualImagesRequest {
  updates: {
    virtualImageId: string  // ✅ Database ID
    isNsfw: boolean
    // ...
  }[]
}
```

**B. Relationship Storage**
```typescript
// Store ID relationships during creation
const relationships = virtualImages.map((img, index) => ({
  job_id: jobId,
  virtual_image_id: img.id,  // ✅ Use database ID
  s3_key: s3Keys[index],     // Reference only
  upload_order: index        // For AWS correlation
}));
```

**C. Update Process**
```typescript
// OLD: Try to find by path (fails)
const virtualImage = await findByPath(awsResult.imagePath); // ❌

// NEW: Look up by ID relationship
const relationship = await supabase
  .from('bulk_job_virtual_images')
  .select('virtual_image_id')
  .eq('job_id', jobId)
  .eq('upload_order', awsResult.position)
  .single();

await virtualImageManager.updateWithRekognitionData(
  relationship.virtual_image_id, // ✅ Reliable ID
  awsResult.rekognitionData
);
```

### 4. Benefits of ID-Based Architecture

1. **Reliable Matching**: Database IDs never change, unlike file paths
2. **Complete Data**: Full rekognition_data gets stored properly  
3. **Audit Trail**: Can track which images belong to which jobs
4. **Performance**: Direct ID lookups vs fuzzy path matching
5. **Scalable**: Works with any number of images/jobs

### 5. Migration Path

1. ✅ **Database**: Add `bulk_job_virtual_images` table (migration created)
2. ✅ **Interface**: Update virtual-image-bridge to use IDs (partially complete)
3. 🔄 **Upload**: Modify bulk-nsfw-upload to store relationships  
4. 🔄 **Status**: Modify bulk-nsfw-status to update by ID
5. 🔄 **Results**: Update result processing to use ID lookups

### 6. Next Steps

To complete the fix:

1. **Update bulk-nsfw-upload**: Include S3 keys and upload order when creating virtual images
2. **Update bulk-nsfw-status**: Look up virtual image IDs from relationships table  
3. **Update result processing**: Use ID-based updates instead of path matching
4. **Test**: Verify rekognition_data fields get populated correctly

## Summary

The path-based approach was fundamentally flawed because:
- S3 temp paths ≠ device paths ≠ database paths
- File paths can change, but database IDs are permanent
- AWS results reference S3 positions, not file paths

The ID-based approach is the correct solution because:
- Virtual images have unique, permanent database IDs
- Relationships are tracked explicitly in the database
- Updates happen by ID, which is 100% reliable
- Full rekognition data gets stored in the dedicated field

**Bottom line**: Stop trying to match by paths. Use database IDs like a proper relational system.
