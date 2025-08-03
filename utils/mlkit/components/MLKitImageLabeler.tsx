/**
 * ML Kit Component Wrapper
 * Bridges the hook-based ML Kit system with the class-based processor system
 */

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useMLKitImageLabeling } from '../hooks/useMLKitImageLabeling';
import { ImageLabel } from '../types/MLKitTypes';

export interface MLKitImageLabelerRef {
  processImage: (imagePath: string) => Promise<ImageLabel[]>;
  isReady: boolean;
}

export const MLKitImageLabeler = forwardRef<MLKitImageLabelerRef>((props, ref) => {
  const { processImage, isReady } = useMLKitImageLabeling();

  useImperativeHandle(ref, () => ({
    processImage,
    isReady
  }));

  return null; // This is a headless component
});

MLKitImageLabeler.displayName = 'MLKitImageLabeler';
