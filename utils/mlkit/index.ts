/**
 * ML Kit Module Index - Main exports for the ML Kit system
 */

// Main manager
export { MLKitManager } from './MLKitManager';

// Cache system
export { SecureImageCache } from './cache/SecureImageCache';

// Processors
export { ImageLabelingProcessor } from './processors/ImageLabelingProcessor';
export { FaceDetectionProcessor } from './processors/FaceDetectionProcessor';
export { TextRecognitionProcessor } from './processors/TextRecognitionProcessor';
export { QualityAssessmentProcessor } from './processors/QualityAssessmentProcessor';
export { SceneAnalysisProcessor } from './processors/SceneAnalysisProcessor';

// Types
export * from './types/MLKitTypes';

// Re-export manager instance methods
import { MLKitManager } from './MLKitManager';

// Convenience functions
export const createMLKitManager = (config?: any) => MLKitManager.getInstance(config);
export const getMLKitManager = () => MLKitManager.getInstance();
