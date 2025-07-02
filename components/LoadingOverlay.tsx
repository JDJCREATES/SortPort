import React from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { lightTheme } from '../utils/theme';

interface LoadingOverlayProps {
  visible: boolean;
  progress?: number;
  message?: string;
}

export function LoadingOverlay({ 
  visible, 
  progress = 0, 
  message = "Processing your photos..." 
}: LoadingOverlayProps) {
  return (
    <Modal visible={visible} transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.spinner}>
            <Text style={styles.spinnerText}>🧠</Text>
          </View>
          <Text style={styles.message}>{message}</Text>
          {progress > 0 && progress < 100 && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.progressText}>{Math.round(progress)}%</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.lg,
    padding: lightTheme.spacing.xl,
    alignItems: 'center',
    minWidth: 200,
  },
  spinner: {
    marginBottom: lightTheme.spacing.md,
  },
  spinnerText: {
    fontSize: 48,
  },
  message: {
    fontSize: 16,
    color: lightTheme.colors.text,
    textAlign: 'center',
    marginBottom: lightTheme.spacing.md,
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: lightTheme.colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: lightTheme.spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: lightTheme.colors.primary,
  },
  progressText: {
    fontSize: 14,
    color: lightTheme.colors.textSecondary,
    fontWeight: '600',
  },
});