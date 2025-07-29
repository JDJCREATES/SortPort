/**
 * Edge Function Integration Examples
 * 
 * These examples show how to integrate your existing Edge Functions 
 * with the SnapSort server's virtual_image system.
 */

// Example 1: From your Upload Edge Function
// Call this when starting the Rekognition job
async function createVirtualImagePlaceholder(imageData) {
  const response = await fetch(`${SNAPSORT_SERVER}/api/virtual-images`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      user_id: imageData.userId,
      original_path: imageData.storagePath,
      original_name: imageData.originalName,
      hash: imageData.fileHash,
      fileSize: imageData.fileSize,
      mimeType: imageData.mimeType,
      exifData: imageData.exifData || null
      // No rekognitionData yet - will be added later
    })
  });
  
  const result = await response.json();
  return result.data; // Returns the created virtual image with ID
}

// Example 2: From your Rekognition Results Edge Function
// Call this when Rekognition job completes
async function updateVirtualImageWithRekognition(jobResult) {
  const response = await fetch(`${SNAPSORT_SERVER}/api/virtual-images/webhook/rekognition-complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
      // No auth required for webhook - this is called server-to-server
    },
    body: JSON.stringify({
      jobId: jobResult.jobId,
      userId: jobResult.userId,
      imageId: jobResult.imageId, // If you have it from step 1
      rekognitionData: jobResult.rekognitionResponse, // Full AWS response
      originalPath: jobResult.originalPath,
      originalName: jobResult.originalName,
      hash: jobResult.hash,
      fileSize: jobResult.fileSize,
      mimeType: jobResult.mimeType,
      exifData: jobResult.exifData
    })
  });
  
  const result = await response.json();
  return result.data;
}

// Example 3: Complete Workflow Integration
class ImageUploadWorkflow {
  constructor(snapSortServerUrl) {
    this.serverUrl = snapSortServerUrl;
  }
  
  async processImageUpload(file, userId, userToken) {
    try {
      // Step 1: Create placeholder in virtual_image table
      const placeholder = await this.createPlaceholder({
        userId,
        file,
        userToken
      });
      
      // Step 2: Start Rekognition job (your existing Edge Function)
      const rekognitionJob = await this.startRekognitionAnalysis({
        file,
        userId,
        imageId: placeholder.id, // Link to virtual image
        jobMetadata: {
          virtualImageId: placeholder.id,
          originalPath: placeholder.original_path
        }
      });
      
      // Step 3: Your existing Edge Function will call the webhook when done
      // No additional code needed - the webhook will update the virtual image
      
      return {
        virtualImageId: placeholder.id,
        rekognitionJobId: rekognitionJob.id,
        status: 'processing'
      };
      
    } catch (error) {
      console.error('Image upload workflow failed:', error);
      throw error;
    }
  }
  
  async createPlaceholder({ userId, file, userToken }) {
    const imageData = {
      user_id: userId,
      original_path: await this.uploadToStorage(file),
      original_name: file.name,
      hash: await this.generateHash(file),
      fileSize: file.size,
      mimeType: file.type,
      exifData: await this.extractExifData(file)
    };
    
    const response = await fetch(`${this.serverUrl}/api/virtual-images`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(imageData)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create virtual image: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.data;
  }
  
  // Your existing methods
  async startRekognitionAnalysis({ file, userId, imageId, jobMetadata }) {
    // Your existing Rekognition Edge Function logic
    // Just add imageId and any other metadata you need
  }
  
  async uploadToStorage(file) {
    // Your existing storage upload logic
  }
  
  async generateHash(file) {
    // Your existing hash generation logic
  }
  
  async extractExifData(file) {
    // Your existing EXIF extraction logic
  }
}

// Example 4: Retrieving processed images for sorting
async function getProcessedImages(userId, userToken) {
  const response = await fetch(`${SNAPSORT_SERVER}/api/virtual-images/user/${userId}?limit=100&sortBy=created_at&sortOrder=desc`, {
    headers: {
      'Authorization': `Bearer ${userToken}`
    }
  });
  
  const result = await response.json();
  return result.data.images;
}

// Example 5: Batch processing for existing images
async function processExistingImages(imageDataArray, userToken) {
  const response = await fetch(`${SNAPSORT_SERVER}/api/virtual-images/batch`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      images: imageDataArray.map(img => ({
        user_id: img.userId,
        original_path: img.path,
        original_name: img.name,
        hash: img.hash,
        fileSize: img.size,
        mimeType: img.type,
        rekognitionData: img.existingRekognitionData // If you have it
      }))
    })
  });
  
  const result = await response.json();
  return result.data;
}

export {
  createVirtualImagePlaceholder,
  updateVirtualImageWithRekognition,
  ImageUploadWorkflow,
  getProcessedImages,
  processExistingImages
};
