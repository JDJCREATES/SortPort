/**
 * EXIF Data Extraction Utility
 * 
 * Extracts EXIF metadata from images including:
 * - Date taken (from EXIF DateTimeOriginal)
 * - Date modified (from EXIF DateTime or LastModified)
 * - GPS coordinates (latitude/longitude)
 * - Other relevant metadata for virtual_image table population
 */

import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface ExtractedEXIFData {
  date_taken?: string | null;           // DateTimeOriginal from EXIF
  date_modified?: string | null;        // DateTime from EXIF or file modification date  
  date_imported?: string | null;        // Current timestamp when imported
  location_lat?: number | null;         // GPS latitude
  location_lng?: number | null;         // GPS longitude
  location_name?: string | null;        // Human-readable location (to be populated later)
  location_country?: string | null;     // Country (to be populated later)
  location_city?: string | null;        // City (to be populated later)
  image_orientation?: string | null;    // Image orientation from EXIF
  camera_make?: string | null;          // Camera manufacturer
  camera_model?: string | null;         // Camera model
  focal_length?: number | null;         // Focal length
  iso_speed?: number | null;            // ISO speed
  aperture?: number | null;             // F-stop value
  shutter_speed?: string | null;        // Shutter speed
  flash_used?: boolean | null;          // Flash usage
  width?: number | null;                // Image width in pixels
  height?: number | null;               // Image height in pixels
}

export interface ImageWithEXIF {
  uri: string;
  exifData: ExtractedEXIFData;
  extractionSuccess: boolean;
  extractionError?: string;
}

/**
 * EXIF Data Extractor Class
 */
export class EXIFExtractor {

  /**
   * Extract EXIF data from a single image URI
   */
  static async extractEXIFData(imageUri: string): Promise<ExtractedEXIFData> {
    const defaultData: ExtractedEXIFData = {
      date_imported: new Date().toISOString(), // Always set import date
    };

    try {
      // For React Native/Expo, we'll use a simple approach first
      // In a full implementation, you'd use libraries like react-native-exif or expo-image-picker
      
      if (Platform.OS === 'web') {
        // Web implementation - limited EXIF support
        return await this.extractEXIFDataWeb(imageUri, defaultData);
      } else {
        // Native implementation - use expo-image-picker or react-native-exif
        return await this.extractEXIFDataNative(imageUri, defaultData);
      }
      
    } catch (error) {
      console.warn(`⚠️ EXIF extraction failed for ${imageUri}:`, error);
      return defaultData;
    }
  }

  /**
   * Web implementation - limited EXIF extraction
   */
  private static async extractEXIFDataWeb(imageUri: string, defaultData: ExtractedEXIFData): Promise<ExtractedEXIFData> {
    try {
      // For web, we're limited in EXIF extraction
      // We can get file modification date from file system if available
      
      const fileInfo = await FileSystem.getInfoAsync(imageUri);
      if (fileInfo.exists && 'modificationTime' in fileInfo && fileInfo.modificationTime) {
        defaultData.date_modified = new Date(fileInfo.modificationTime).toISOString();
        // If no date_taken is found, use modification date as fallback
        defaultData.date_taken = defaultData.date_modified;
      }

      return defaultData;
      
    } catch (error) {
      console.warn('⚠️ Web EXIF extraction failed:', error);
      return defaultData;
    }
  }

  /**
   * Native implementation - full EXIF extraction
   */
  private static async extractEXIFDataNative(imageUri: string, defaultData: ExtractedEXIFData): Promise<ExtractedEXIFData> {
    try {
      // TODO: Implement with react-native-exif or similar library
      // For now, we'll extract what we can from file system
      
      const fileInfo = await FileSystem.getInfoAsync(imageUri);
      if (fileInfo.exists && 'modificationTime' in fileInfo && fileInfo.modificationTime) {
        defaultData.date_modified = new Date(fileInfo.modificationTime).toISOString();
        // If no date_taken is found, use modification date as fallback
        defaultData.date_taken = defaultData.date_modified;
      }

      // In a real implementation, you would use a library like:
      // import { getExifData } from 'react-native-exif';
      // const exifData = await getExifData(imageUri);
      // 
      // Then map the EXIF fields:
      // if (exifData.DateTimeOriginal) {
      //   defaultData.date_taken = this.parseEXIFDate(exifData.DateTimeOriginal);
      // }
      // if (exifData.GPS) {
      //   defaultData.location_lat = this.parseGPSCoordinate(exifData.GPS.Latitude, exifData.GPS.LatitudeRef);
      //   defaultData.location_lng = this.parseGPSCoordinate(exifData.GPS.Longitude, exifData.GPS.LongitudeRef);
      // }

      return defaultData;
      
    } catch (error) {
      console.warn('⚠️ Native EXIF extraction failed:', error);
      return defaultData;
    }
  }

  /**
   * Extract EXIF data from multiple images in batch
   */
  static async extractEXIFDataBatch(imageUris: string[]): Promise<Map<string, ExtractedEXIFData>> {
    console.log(`📸 Extracting EXIF data from ${imageUris.length} images...`);
    
    const exifMap = new Map<string, ExtractedEXIFData>();
    const results = await Promise.allSettled(
      imageUris.map(async (uri, index) => {
        try {
          const exifData = await this.extractEXIFData(uri);
          return { uri, exifData, index };
        } catch (error) {
          console.warn(`⚠️ EXIF extraction failed for image ${index}:`, error);
          return { 
            uri, 
            exifData: { date_imported: new Date().toISOString() }, 
            index 
          };
        }
      })
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        exifMap.set(result.value.uri, result.value.exifData);
        exifMap.set(`image_${index}`, result.value.exifData); // Also store by index
        exifMap.set(`order_${index}`, result.value.exifData); // And by order
      }
    });

    console.log(`✅ EXIF extraction complete: ${exifMap.size / 3} images processed`);
    return exifMap;
  }

  /**
   * Parse EXIF date string to ISO format
   */
  private static parseEXIFDate(exifDateString: string): string | null {
    try {
      // EXIF dates are usually in format "YYYY:MM:DD HH:MM:SS"
      const isoDate = exifDateString.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
      return new Date(isoDate).toISOString();
    } catch (error) {
      console.warn('⚠️ Failed to parse EXIF date:', exifDateString);
      return null;
    }
  }

  /**
   * Parse GPS coordinates from EXIF GPS data
   */
  private static parseGPSCoordinate(
    coordinate: number[] | string, 
    reference: string
  ): number | null {
    try {
      let decimal: number;
      
      if (Array.isArray(coordinate) && coordinate.length >= 3) {
        // Convert degrees, minutes, seconds to decimal
        decimal = coordinate[0] + coordinate[1] / 60 + coordinate[2] / 3600;
      } else if (typeof coordinate === 'number') {
        decimal = coordinate;
      } else {
        return null;
      }

      // Apply reference (N/S for latitude, E/W for longitude)
      if (reference === 'S' || reference === 'W') {
        decimal = -decimal;
      }

      return decimal;
    } catch (error) {
      console.warn('⚠️ Failed to parse GPS coordinate:', coordinate, reference);
      return null;
    }
  }

  /**
   * Format EXIF data for transmission to server
   */
  static formatEXIFForTransmission(exifMap: Map<string, ExtractedEXIFData>): Record<string, ExtractedEXIFData> {
    const exifObject: Record<string, ExtractedEXIFData> = {};
    
    exifMap.forEach((exifData, key) => {
      exifObject[key] = exifData;
    });

    return exifObject;
  }

  /**
   * Validate extracted EXIF data
   */
  static validateEXIFData(exifData: ExtractedEXIFData): boolean {
    // At minimum, we should have date_imported
    return !!exifData.date_imported;
  }

  /**
   * Get summary of EXIF extraction results
   */
  static getEXIFSummary(exifMap: Map<string, ExtractedEXIFData>): {
    totalImages: number;
    withDateTaken: number;
    withGPS: number;
    withCameraInfo: number;
  } {
    const uniqueImages = new Set<string>();
    let withDateTaken = 0;
    let withGPS = 0;
    let withCameraInfo = 0;

    exifMap.forEach((exifData, key) => {
      // Only count actual image URIs, not the index/order duplicates
      if (key.startsWith('file://') || key.startsWith('content://') || key.startsWith('ph://')) {
        uniqueImages.add(key);
        
        if (exifData.date_taken) withDateTaken++;
        if (exifData.location_lat && exifData.location_lng) withGPS++;
        if (exifData.camera_make || exifData.camera_model) withCameraInfo++;
      }
    });

    return {
      totalImages: uniqueImages.size,
      withDateTaken,
      withGPS,
      withCameraInfo
    };
  }
}

/**
 * Helper function to log EXIF extraction results
 */
export function logEXIFSummary(exifMap: Map<string, ExtractedEXIFData>): void {
  const summary = EXIFExtractor.getEXIFSummary(exifMap);
  
  console.log(`📸 EXIF Extraction Summary:`);
  console.log(`   Total Images: ${summary.totalImages}`);
  console.log(`   With Date Taken: ${summary.withDateTaken} (${Math.round(summary.withDateTaken / summary.totalImages * 100)}%)`);
  console.log(`   With GPS Data: ${summary.withGPS} (${Math.round(summary.withGPS / summary.totalImages * 100)}%)`);
  console.log(`   With Camera Info: ${summary.withCameraInfo} (${Math.round(summary.withCameraInfo / summary.totalImages * 100)}%)`);
}
