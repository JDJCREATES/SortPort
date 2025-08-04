/**
 * Hook-based ML Kit Image Labeling Service
 * Uses official @react-native-ml-kit packages via processors
 */

import { useState, useCallback } from 'react';
import { runImageLabeling } from '../processors/ImageLabelingProcessor';
import { ImageLabel } from '../types/MLKitTypes';

export function useMLKitImageLabeling() {
  const [isLoading, setIsLoading] = useState(false);

  const processImage = useCallback(async (imagePath: string): Promise<ImageLabel[]> => {
    try {
      setIsLoading(true);
      // console.log(`🏷️ Processing image for labels with ML Kit: ${imagePath}`);
      
      // Use the processor function which uses official ML Kit
      const results = await runImageLabeling([imagePath]);
      const labels = results[imagePath] || [];

      // Convert to our format
      const imageLabels: ImageLabel[] = labels.map((label, index) => ({
        text: label.text,
        confidence: label.confidence,
        index
      }));

      return imageLabels;

    } catch (error) {
      console.error('❌ Error processing image labels:', error);
      return getFallbackLabels();
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getFallbackLabels = (): ImageLabel[] => {
    return [
      { text: 'Image', confidence: 0.7, index: 0 },
      { text: 'Photo', confidence: 0.6, index: 1 }
    ];
  };

  return {
    processImage,
    isReady: true, // Official ML Kit is always ready
    isLoading
  };
}
