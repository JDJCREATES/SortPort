/**
 * ML Kit Diagnostic Utility
 * Helps debug file path corruption and ML Kit integration issues
 */

import { Platform } from 'react-native';
import { ImagePathHelper } from '../helpers/imagePathHelper';

export interface DiagnosticReport {
  originalPath: string;
  convertedPath: string;
  pathIntegrity: boolean;
  lengthMatch: boolean;
  fileExists: boolean;
  platform: string;
  timestamp: number;
  errors: string[];
}

export class MLKitDiagnostics {
  /**
   * Run comprehensive diagnostics on an image path
   */
  static async diagnoseImagePath(imagePath: string): Promise<DiagnosticReport> {
    const errors: string[] = [];
    const timestamp = Date.now();
    
    console.log(`🔍 Running ML Kit diagnostics for: ${imagePath}`);
    
    try {
      // Check original path
      if (!imagePath || typeof imagePath !== 'string') {
        errors.push('Invalid input path type');
      }
      
      if (imagePath.trim().length === 0) {
        errors.push('Empty path provided');
      }
      
      // Convert path and check integrity
      let convertedPath = '';
      let pathIntegrity = false;
      let lengthMatch = false;
      
      try {
        convertedPath = ImagePathHelper.convertToMLKitPath(imagePath);
        
        // Check if conversion maintained integrity
        const originalFilename = imagePath.split('/').pop() || '';
        const convertedFilename = convertedPath.split('/').pop() || '';
        
        pathIntegrity = originalFilename === convertedFilename;
        lengthMatch = Math.abs(imagePath.length - convertedPath.length) <= 7; // Allow for file:// prefix
        
        if (!pathIntegrity) {
          errors.push(`Filename mismatch: ${originalFilename} vs ${convertedFilename}`);
        }
        
        if (!lengthMatch) {
          errors.push(`Significant length change: ${imagePath.length} vs ${convertedPath.length}`);
        }
        
      } catch (conversionError) {
        errors.push(`Path conversion failed: ${conversionError}`);
        convertedPath = 'CONVERSION_FAILED';
      }
      
      // Check if file exists (basic validation)
      let fileExists = false;
      try {
        // Try to access the file
        const response = await fetch(convertedPath, { method: 'HEAD' });
        fileExists = response.ok;
      } catch (fetchError) {
        errors.push(`File access test failed: ${fetchError}`);
      }
      
      const report: DiagnosticReport = {
        originalPath: imagePath,
        convertedPath,
        pathIntegrity,
        lengthMatch,
        fileExists,
        platform: Platform.OS,
        timestamp,
        errors
      };
      
      // Log results
      console.log(`📊 Diagnostic Report for ${imagePath}:`);
      console.log(`  ✅ Path Integrity: ${pathIntegrity}`);
      console.log(`  ✅ Length Match: ${lengthMatch}`);
      console.log(`  ✅ File Exists: ${fileExists}`);
      console.log(`  ⚠️ Errors: ${errors.length}`);
      
      if (errors.length > 0) {
        console.log(`  🔴 Issues found:`);
        errors.forEach(error => console.log(`    - ${error}`));
      }
      
      return report;
      
    } catch (error) {
      errors.push(`Diagnostic failed: ${error}`);
      
      return {
        originalPath: imagePath,
        convertedPath: 'DIAGNOSTIC_FAILED',
        pathIntegrity: false,
        lengthMatch: false,
        fileExists: false,
        platform: Platform.OS,
        timestamp,
        errors
      };
    }
  }
  
  /**
   * Run diagnostics on multiple paths and generate summary
   */
  static async diagnoseBatch(imagePaths: string[]): Promise<{
    reports: DiagnosticReport[];
    summary: {
      totalPaths: number;
      successfulConversions: number;
      integrityIssues: number;
      fileAccessIssues: number;
      commonErrors: string[];
    };
  }> {
    console.log(`🔍 Running batch diagnostics on ${imagePaths.length} paths`);
    
    const reports = await Promise.all(
      imagePaths.map(path => this.diagnoseImagePath(path))
    );
    
    // Generate summary
    const totalPaths = reports.length;
    const successfulConversions = reports.filter(r => r.convertedPath !== 'CONVERSION_FAILED').length;
    const integrityIssues = reports.filter(r => !r.pathIntegrity).length;
    const fileAccessIssues = reports.filter(r => !r.fileExists).length;
    
    // Find common errors
    const allErrors = reports.flatMap(r => r.errors);
    const errorCounts = allErrors.reduce((acc, error) => {
      acc[error] = (acc[error] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const commonErrors = Object.entries(errorCounts)
      .filter(([_, count]) => count > 1)
      .sort(([_, a], [__, b]) => b - a)
      .map(([error, _]) => error);
    
    const summary = {
      totalPaths,
      successfulConversions,
      integrityIssues,
      fileAccessIssues,
      commonErrors
    };
    
    console.log(`📊 Batch Diagnostic Summary:`);
    console.log(`  Total Paths: ${totalPaths}`);
    console.log(`  Successful Conversions: ${successfulConversions}/${totalPaths}`);
    console.log(`  Integrity Issues: ${integrityIssues}`);
    console.log(`  File Access Issues: ${fileAccessIssues}`);
    console.log(`  Common Errors: ${commonErrors.join(', ')}`);
    
    return { reports, summary };
  }
  
  /**
   * Test ML Kit path conversion with various input formats
   */
  static testPathConversions(): void {
    const testPaths = [
      'file:///data/user/0/com.anonymous.snapsort/cache/test.jpg',
      '/data/user/0/com.anonymous.snapsort/cache/test.jpg',
      'content://media/external/images/media/123',
      'asset://test.jpg',
      'file:///data/user/0/com.anonymous.snapsort/cache/1bd0cc6f-33d7-4f1d-bc31-68c898fcf191.JPEG'
    ];
    
    console.log('🧪 Testing path conversions:');
    testPaths.forEach(path => {
      try {
        const converted = ImagePathHelper.convertToMLKitPath(path);
        console.log(`  ✅ ${path} -> ${converted}`);
      } catch (error) {
        console.log(`  ❌ ${path} -> ERROR: ${error}`);
      }
    });
  }
}
