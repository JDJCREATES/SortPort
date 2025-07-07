import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lightTheme } from '../utils/theme';

interface ColorPickerProps {
  visible: boolean;
  onClose: () => void;
  onColorSelect: (color: string) => void;
  currentColor: string;
  title: string;
}

const predefinedColors = [
  '#6366F1', // Indigo
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#EF4444', // Red
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
  '#8B5A2B', // Brown
  '#6B7280', // Gray
  '#F97316', // Orange
  '#84CC16', // Lime
  '#14B8A6', // Teal
  '#A855F7', // Violet
  '#F43F5E', // Rose
  '#0EA5E9', // Sky
];

export function ColorPicker({ visible, onClose, onColorSelect, currentColor, title }: ColorPickerProps) {
  const [selectedColor, setSelectedColor] = useState(currentColor);

  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
  };

  const handleConfirm = () => {
    onColorSelect(selectedColor);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={lightTheme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.colorGrid}>
              {predefinedColors.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    selectedColor === color && styles.selectedColor,
                  ]}
                  onPress={() => handleColorSelect(color)}
                >
                  {selectedColor === color && (
                    <Ionicons name="checkmark" size={20} color="white" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.preview}>
              <Text style={styles.previewLabel}>Preview</Text>
              <View style={[styles.previewColor, { backgroundColor: selectedColor }]} />
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.confirmButton, { backgroundColor: selectedColor }]} 
              onPress={handleConfirm}
            >
              <Text style={styles.confirmButtonText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: lightTheme.colors.background,
    borderTopLeftRadius: lightTheme.borderRadius.xl,
    borderTopRightRadius: lightTheme.borderRadius.xl,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: lightTheme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.colors.border,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
  },
  closeButton: {
    padding: lightTheme.spacing.xs,
  },
  content: {
    padding: lightTheme.spacing.lg,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: lightTheme.spacing.md,
    marginBottom: lightTheme.spacing.xl,
  },
  colorOption: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  selectedColor: {
    borderWidth: 3,
    borderColor: lightTheme.colors.background,
    elevation: 4,
    shadowOpacity: 0.2,
  },
  preview: {
    alignItems: 'center',
    marginBottom: lightTheme.spacing.lg,
  },
  previewLabel: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.sm,
  },
  previewColor: {
    width: 80,
    height: 80,
    borderRadius: 40,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  footer: {
    flexDirection: 'row',
    padding: lightTheme.spacing.lg,
    gap: lightTheme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: lightTheme.colors.border,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: lightTheme.spacing.md,
    borderRadius: lightTheme.borderRadius.md,
    backgroundColor: lightTheme.colors.surface,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.textSecondary,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: lightTheme.spacing.md,
    borderRadius: lightTheme.borderRadius.md,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: 'white',
  },
});