/**
 * MLKitProvider.tsx
 * Provider for official @react-native-ml-kit packages
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { runImageLabeling } from '../processors/ImageLabelingProcessor';
import { TextRecognitionProcessor } from '../processors/TextRecognitionProcessor';
import { FaceDetectionProcessor } from '../processors/FaceDetectionProcessor';

interface MLKitContextType {
  imageLabeling: {
    processImages: (uris: string[]) => Promise<Record<string, { text: string; confidence: number }[]>>;
  };
  textRecognition: TextRecognitionProcessor;
  faceDetection: FaceDetectionProcessor;
}

const MLKitContext = createContext<MLKitContextType | null>(null);

interface MLKitProviderProps {
  children: ReactNode;
}

export function MLKitProvider({ children }: MLKitProviderProps) {
  const textRecognition = new TextRecognitionProcessor({
    language: 'en',
    enableLanguageDetection: true,
    minConfidence: 0.5
  });

  const faceDetection = new FaceDetectionProcessor({
    minFaceSize: 0.1,
    enableClassification: true,
    enableLandmarks: true,
    enableContours: false,
    enableTracking: false
  });

  const contextValue: MLKitContextType = {
    imageLabeling: {
      processImages: runImageLabeling
    },
    textRecognition,
    faceDetection
  };

  return (
    <MLKitContext.Provider value={contextValue}>
      {children}
    </MLKitContext.Provider>
  );
}

export function useMLKitContext() {
  const context = useContext(MLKitContext);
  if (!context) {
    throw new Error('useMLKitContext must be used within a MLKitProvider');
  }
  return context;
}
