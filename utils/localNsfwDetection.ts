interface LocalNSFWResult {
  isNsfw: boolean;
  confidence: number;
  method: string;
}

interface BatchNSFWResult {
  imageUri: string;
  isNsfw: boolean;
  confidence: number;
  method: string;
}

export class LocalNSFWDetector {
  private static model: any = null;
  private static isInitialized = false;

  static async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      console.log('🧠 Initializing aggressive local NSFW detection...');
      
      // Use aggressive heuristic-based approach
      this.model = new AggressiveHeuristicDetector();
      
      this.isInitialized = true;
      console.log('✅ Aggressive local NSFW detection initialized');
    } catch (error) {
      console.error('❌ Failed to initialize NSFW detection:', error);
      this.model = new AggressiveHeuristicDetector();
      this.isInitialized = true;
    }
  }

  static async detectNSFW(imageUri: string): Promise<LocalNSFWResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      return await this.model.detect(imageUri);
    } catch (error) {
      console.warn('NSFW detection failed:', error);
      return { isNsfw: false, confidence: 0, method: 'error' };
    }
  }

  static async batchDetectNSFW(imageUris: string[], batchSize: number = 30): Promise<BatchNSFWResult[]> {
    const results: BatchNSFWResult[] = [];
    
    // Larger batches since we're just doing string analysis
    for (let i = 0; i < imageUris.length; i += batchSize) {
      const batch = imageUris.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (uri): Promise<BatchNSFWResult> => {
        try {
          const result = await this.detectNSFW(uri);
          return {
            imageUri: uri,
            isNsfw: result.isNsfw,
            confidence: result.confidence,
            method: result.method
          };
        } catch (error) {
          return {
            imageUri: uri,
            isNsfw: false,
            confidence: 0,
            method: 'batch-error'
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Minimal delay since we're just doing string operations
      if (i + batchSize < imageUris.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    return results;
  }
}

// Aggressive detector - better to flag too much than miss NSFW content
class AggressiveHeuristicDetector {
  async detect(imageUri: string): Promise<LocalNSFWResult> {
    try {
      const analysis = this.analyzeImagePath(imageUri);
      
      let suspicionScore = 0;
      const reasons: string[] = [];
      
      // ✅ AGGRESSIVE: Folder-based heuristics
      const folderScore = this.analyzeFolderName(analysis.folderName);
      suspicionScore += folderScore.score;
      if (folderScore.reason) reasons.push(folderScore.reason);
      
      // ✅ AGGRESSIVE: Filename pattern analysis
      const filenameScore = this.analyzeFilename(analysis.filename);
      suspicionScore += filenameScore.score;
      if (filenameScore.reason) reasons.push(filenameScore.reason);
      
      // ✅ AGGRESSIVE: Path analysis
      const pathScore = this.analyzePathPatterns(imageUri);
      suspicionScore += pathScore.score;
      if (pathScore.reason) reasons.push(pathScore.reason);
      
      // ✅ AGGRESSIVE: Time-based patterns
      const timeScore = this.analyzeTimePatterns(analysis.filename);
      suspicionScore += timeScore.score;
      if (timeScore.reason) reasons.push(timeScore.reason);
      
      // ✅ AGGRESSIVE: File characteristics
      const fileScore = this.analyzeFileCharacteristics(analysis.filename);
      suspicionScore += fileScore.score;
      if (fileScore.reason) reasons.push(fileScore.reason);
      
      const confidence = Math.max(0, Math.min(1, suspicionScore));
      
      // 🚨 LOWERED THRESHOLD: More aggressive flagging
      const isNsfw = confidence > 0.25; // Much lower threshold
      
      // Log all flagged images for monitoring
      if (isNsfw) {
        console.log(`🚩 Locally flagged:`, {
          path: imageUri.split('/').slice(-3).join('/'),
          confidence: confidence.toFixed(2),
          reasons,
          folder: analysis.folderName
        });
      }
      
      return {
        isNsfw,
        confidence,
        method: 'aggressive_heuristic'
      };
    } catch (error) {
      console.warn('Aggressive detection failed:', error);
      return { isNsfw: false, confidence: 0, method: 'aggressive_error' };
    }
  }

  private analyzeFolderName(folderName: string): { score: number; reason?: string } {
    const folder = folderName.toLowerCase();
    
    // 🚨 HIGH SUSPICION: Known risky folders
    const highRisk = [
      'download', 'downloads', 'whatsapp', 'telegram', 'private', 'hidden', 
      'temp', 'cache', 'dcim', 'pictures', 'images', 'media', 'gallery',
      'photos', 'camera', 'bluetooth', 'received', 'saved', 'backup'
    ];
    if (highRisk.some(risk => folder.includes(risk))) {
      return { score: 0.4, reason: 'risky_folder' };
    }
    
    // 🚨 MEDIUM SUSPICION: Social media and messaging
    const mediumRisk = [
      'instagram', 'snapchat', 'facebook', 'twitter', 'tiktok', 'discord',
      'messenger', 'viber', 'skype', 'kik', 'dating', 'tinder', 'bumble'
    ];
    if (mediumRisk.some(risk => folder.includes(risk))) {
      return { score: 0.3, reason: 'social_folder' };
    }
    
    // ✅ ONLY VERY OBVIOUS SAFE FOLDERS GET NEGATIVE SCORE
    const definitelySafe = ['screenshot', 'screen_record', 'screen capture'];
    if (definitelySafe.some(safe => folder.includes(safe))) {
      return { score: -0.2, reason: 'screenshot_folder' };
    }
    
    // Default: slightly suspicious (better safe than sorry)
    return { score: 0.1, reason: 'unknown_folder' };
  }

  private analyzeFilename(filename: string): { score: number; reason?: string } {
    const file = filename.toLowerCase();
    
    // 🚨 HIGH SUSPICION: Obvious patterns
    if (file.includes('private') || file.includes('hidden') || file.includes('secret') || 
        file.includes('nsfw') || file.includes('adult') || file.includes('xxx')) {
      return { score: 0.5, reason: 'explicit_filename' };
    }
    
    // 🚨 MEDIUM SUSPICION: Download/temp patterns
    if (file.includes('temp') || file.includes('cache') || file.includes('tmp') ||
        file.includes('download') || file.includes('received') || file.includes('saved')) {
      return { score: 0.3, reason: 'download_pattern' };
    }
    
    // 🚨 MEDIUM SUSPICION: Random/generated filenames (often downloads)
    if (/^[a-f0-9]{8,}/.test(file) || /^\d{13,}/.test(file) || 
        /^[a-z0-9]{20,}/.test(file) || file.includes('uuid')) {
      return { score: 0.3, reason: 'generated_filename' };
    }
    
    // 🚨 LOW SUSPICION: Short random names
    if (file.length < 8 && /^[a-z0-9]+$/.test(file.replace(/\.[^.]+$/, ''))) {
      return { score: 0.2, reason: 'short_random' };
    }
    
    // ✅ ONLY OBVIOUS SCREENSHOTS GET NEGATIVE SCORE
    if (file.includes('screenshot') || file.includes('screen') || 
        file.startsWith('scr_') || file.startsWith('screenshot_')) {
      return { score: -0.3, reason: 'screenshot_file' };
    }
    
    // Default: neutral to slightly suspicious
    return { score: 0.05, reason: 'normal_filename' };
  }

  private analyzePathPatterns(uri: string): { score: number; reason?: string } {
    const uriLower = uri.toLowerCase();
    
    // 🚨 HIGH SUSPICION: Hidden or secure directories
    if (uriLower.includes('/.') && !uriLower.includes('/.thumbnails')) {
      return { score: 0.4, reason: 'hidden_directory' };
    }
    
    // 🚨 MEDIUM SUSPICION: External storage (often used for downloads)
    if (uriLower.includes('/external/') || uriLower.includes('/sdcard/') ||
        uriLower.includes('/storage/') || uriLower.includes('/android_secure/')) {
      return { score: 0.2, reason: 'external_storage' };
    }
    
    // 🚨 LOW SUSPICION: Deep folder structures
    const pathDepth = uri.split('/').filter(part => part.length > 0).length;
    if (pathDepth > 7) {
      return { score: 0.15, reason: 'deep_path' };
    }
    
    return { score: 0 };
  }

  private analyzeTimePatterns(filename: string): { score: number; reason?: string } {
    // 🚨 SUSPICIOUS: Late night timestamps in filename
    const timeMatch = filename.match(/(\d{2})(\d{2})(\d{2})/); // HHMMSS
    if (timeMatch) {
      const hour = parseInt(timeMatch[1]);
      if (hour >= 22 || hour <= 5) {
        return { score: 0.15, reason: 'late_night_timestamp' };
      }
    }
    
    // 🚨 SUSPICIOUS: Recent files (more likely to be problematic)
    const dateMatch = filename.match(/(\d{4})(\d{2})(\d{2})/); // YYYYMMDD
    if (dateMatch) {
      const year = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]);
      const day = parseInt(dateMatch[3]);
      
      const fileDate = new Date(year, month - 1, day);
      const daysSince = (Date.now() - fileDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSince < 30) {
        return { score: 0.1, reason: 'recent_file' };
      }
    }
    
    return { score: 0 };
  }

  private analyzeFileCharacteristics(filename: string): { score: number; reason?: string } {
    const extension = filename.toLowerCase().split('.').pop() || '';
    
    // 🚨 SUSPICIOUS: JPEG files (most photos)
    if (['jpg', 'jpeg'].includes(extension)) {
      return { score: 0.1, reason: 'photo_format' };
    }
    
    // 🚨 SUSPICIOUS: Video files
    if (['mp4', 'avi', 'mov', 'mkv', '3gp'].includes(extension)) {
      return { score: 0.2, reason: 'video_format' };
    }
    
    // ✅ LESS SUSPICIOUS: PNG (often screenshots/graphics)
    if (extension === 'png') {
      return { score: -0.05, reason: 'png_format' };
    }
    
    return { score: 0 };
  }

  private analyzeImagePath(imageUri: string): {
    folderName: string;
    filename: string;
    pathDepth: number;
  } {
    try {
      const pathParts = imageUri.split('/').filter(part => part.length > 0);
      const filename = pathParts.pop() || '';
      const folderName = pathParts.slice(-1)[0] || '';
      const pathDepth = pathParts.length;
      
      return {
        folderName,
        filename,
        pathDepth
      };
    } catch (error) {
      return {
        folderName: '',
        filename: '',
        pathDepth: 0
      };
    }
  }
}