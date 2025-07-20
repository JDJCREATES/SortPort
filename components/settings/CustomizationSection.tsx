import React, { useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Alert, 
  ScrollView, 
  Modal,
  Dimensions,
  FlatList 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { 
  FadeInUp, 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  FadeIn,
  SlideInUp 
} from 'react-native-reanimated';
import { UserFlags, AppSettings } from '../../types';
import { 
  getCurrentTheme, 
  previewThemeColors,
  BACKGROUND_COLORS, 
  ACCENT_COLORS,
  getContrastRatio,
  meetsAccessibilityStandards 
} from '../../utils/theme';
import { useApp } from '../../contexts/AppContext';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface CustomizationSectionProps {
  userFlags: UserFlags;
  settings: AppSettings;
  setShowCreditPurchaseModal: (show: boolean) => void;
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export function CustomizationSection({
  userFlags,
  settings,
  setShowCreditPurchaseModal,
}: CustomizationSectionProps) {
  const { updateSetting } = useApp();
  const theme = getCurrentTheme();
  const [showColorPickerModal, setShowColorPickerModal] = useState(false);
  const [colorPickerType, setColorPickerType] = useState<'primary' | 'secondary'>('primary');
  
  // Animation values
  const primaryScale = useSharedValue(1);
  const secondaryScale = useSharedValue(1);
  
  // Check if user can use color picker
  const canUseColorPicker = userFlags.hasPurchasedCredits;

  const handleColorPress = useCallback((colorType: 'primary' | 'secondary') => {
    if (!canUseColorPicker) {
      Alert.alert(
        'Premium Feature',
        'Theme customization requires credits. Purchase credits to unlock this feature.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Purchase Credits', onPress: () => setShowCreditPurchaseModal(true) }
        ]
      );
      return;
    }

    const scale = colorType === 'primary' ? primaryScale : secondaryScale;
    scale.value = withSpring(0.9, { damping: 15, stiffness: 300 }, () => {
      scale.value = withSpring(1);
    });

    setColorPickerType(colorType);
    setShowColorPickerModal(true);
  }, [canUseColorPicker, primaryScale, secondaryScale, setShowCreditPurchaseModal]);

  const handleColorSelect = useCallback(async (color: string) => {
    console.log('handleColorSelect called with:', color);
    try {
      const currentCustomColors = settings.customColors || {};
      const updatedColors = {
        ...currentCustomColors,
        [colorPickerType]: color,
      };

      console.log('Updating colors:', updatedColors);
      await updateSetting('customColors', updatedColors);
      setShowColorPickerModal(false);
      
      //console.log(`🎨 Updated ${colorPickerType} color to:`, color);
    } catch (error) {
     // console.error('Error updating color:', error);
      Alert.alert('Error', 'Failed to update color. Please try again.');
    }
  }, [settings.customColors, updateSetting, colorPickerType]);

  const resetToDefault = async (colorType: 'primary' | 'secondary') => {
    if (!canUseColorPicker) return;

    try {
      const currentCustomColors = settings.customColors || {};
      const updatedColors = { ...currentCustomColors };
      
      delete updatedColors[colorType];
      
      await updateSetting('customColors', Object.keys(updatedColors).length > 0 ? updatedColors : undefined);
      
      Alert.alert('Reset Complete', `${colorType === 'primary' ? 'Accent' : 'Background'} color has been reset to default.`);
    } catch (error) {
      //console.error('Error resetting color:', error);
      Alert.alert('Error', 'Failed to reset color. Please try again.');
    }
  };

  const resetAllColors = async () => {
    if (!canUseColorPicker) return;

    Alert.alert(
      'Reset All Colors',
      'Are you sure you want to reset all colors to default?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset All',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateSetting('customColors', undefined);
              Alert.alert('Reset Complete', 'All colors have been reset to default.');
            } catch (error) {
              //console.error('Error resetting all colors:', error);
              Alert.alert('Error', 'Failed to reset colors. Please try again.');
            }
          }
        }
      ]
    );
  };

  // Get current colors
  const currentPrimaryColor = settings.customColors?.primary || theme.colors.primary;
  const currentSecondaryColor = settings.customColors?.secondary || theme.colors.secondary;

  // Generate preview theme
  const previewTheme = previewThemeColors({
    primary: currentPrimaryColor,
    secondary: currentSecondaryColor,
  });

  // Check contrast
  const backgroundTextContrast = getContrastRatio(previewTheme.colors.background, previewTheme.colors.text);
  const hasGoodContrast = meetsAccessibilityStandards(previewTheme.colors.background, previewTheme.colors.text);

  // Animated styles
  const primaryAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: primaryScale.value }],
  }));

  const secondaryAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: secondaryScale.value }],
  }));

  const styles = createStyles(theme);

  // Color Picker Modal Component
  const ColorPickerModal = () => {
    const colors = colorPickerType === 'primary' 
      ? ACCENT_COLORS 
      : BACKGROUND_COLORS;
    
    
    const currentColor = colorPickerType === 'primary' ? currentPrimaryColor : currentSecondaryColor;
    
    const renderColorItem = ({ item: color, index }: { item: string, index: number }) => {
      const isSelected = currentColor === color;
      
      return (
        <View style={styles.colorItemContainer}>
          <TouchableOpacity
            style={[
              styles.modalColorOption,
              { backgroundColor: color },
              isSelected && styles.selectedModalColorOption,
            ]}
            onPress={() => {
              console.log('Color button pressed:', color);
              handleColorSelect(color);
            }}
            activeOpacity={0.8}
          >
            {isSelected && (
              <View style={styles.selectedIndicator}>
                <Ionicons name="checkmark" size={20} color="white" />
              </View>
            )}
          </TouchableOpacity>
        </View>
      );
    };

    return (
      <Modal
        visible={showColorPickerModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowColorPickerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowColorPickerModal(false)}
          >
            <View style={styles.modalContainer}>
              <TouchableOpacity activeOpacity={1} onPress={() => {}}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    Choose {colorPickerType === 'primary' ? 'Accent' : 'Background'} Color
                  </Text>
                  <TouchableOpacity
                    style={styles.modalCloseButton}
                    onPress={() => setShowColorPickerModal(false)}
                  >
                    <Ionicons name="close" size={24} color={theme.colors.text} />
                  </TouchableOpacity>
                </View>
            
                <Text style={styles.modalSubtitle}>
                  {colorPickerType === 'primary' 
                    ? 'Select a color for buttons, icons, and highlights'
                    : 'Select a background color. Text and surfaces will adjust automatically.'
                  }
                </Text>

                <FlatList
                  data={colors}
                  renderItem={renderColorItem}
                  keyExtractor={(item, index) => `${item}-${index}`}
                  numColumns={4}
                  contentContainerStyle={styles.colorGrid}
                  showsVerticalScrollIndicator={false}
                  ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                  columnWrapperStyle={styles.colorRow}
                />

                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={styles.modalCancelButton}
                    onPress={() => setShowColorPickerModal(false)}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  
                  {settings.customColors?.[colorPickerType] && (
                    <TouchableOpacity
                      style={styles.modalResetButton}
                      onPress={() => {
                        resetToDefault(colorPickerType);
                        setShowColorPickerModal(false);
                      }}
                    >
                      <Ionicons name="refresh" size={16} color={theme.colors.primary} />
                      <Text style={styles.modalResetText}>Reset to Default</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  };

  return (
    <Animated.View entering={FadeInUp.delay(300)} style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Theme Customization</Text>
        {canUseColorPicker && settings.customColors && (
          <TouchableOpacity style={styles.resetAllButton} onPress={resetAllColors}>
            <Ionicons name="refresh" size={16} color={theme.colors.primary} />
            <Text style={styles.resetAllButtonText}>Reset All</Text>
          </TouchableOpacity>
        )}
      </View>
      
      {/* Accent Color Setting */}
      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Accent Color</Text>
          <Text style={styles.settingDescription}>
            {canUseColorPicker ? 'Color for buttons, icons, and highlights' : 'Premium feature - purchase credits to unlock'}
          </Text>
          {canUseColorPicker && settings.customColors?.primary && (
            <TouchableOpacity 
              style={styles.resetButton}
              onPress={() => resetToDefault('primary')}
            >
              <Text style={styles.resetButtonText}>Reset to Default</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.colorControls}>
          <AnimatedTouchableOpacity
            style={[
              styles.colorPreview, 
              { backgroundColor: currentPrimaryColor },
              !canUseColorPicker && styles.colorPreviewDisabled,
              primaryAnimatedStyle
            ]}
            onPress={() => handleColorPress('primary')}
            disabled={!canUseColorPicker}
          >
            <Ionicons 
              name={canUseColorPicker ? "color-palette" : "lock-closed"} 
              size={16} 
              color="white" 
            />
          </AnimatedTouchableOpacity>
          {!canUseColorPicker && (
            <View style={styles.premiumBadge}>
              <Ionicons name="star" size={12} color={theme.colors.warning} />
              <Text style={styles.premiumText}>PRO</Text>
            </View>
          )}
        </View>
      </View>

      {/* Background Color Setting */}
      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Background Color</Text>
          <Text style={styles.settingDescription}>
            {canUseColorPicker ? 'Main background - surfaces and text auto-adjust' : 'Premium feature - purchase credits to unlock'}
          </Text>
          {canUseColorPicker && settings.customColors?.secondary && (
            <TouchableOpacity 
              style={styles.resetButton}
              onPress={() => resetToDefault('secondary')}
            >
              <Text style={styles.resetButtonText}>Reset to Default</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.colorControls}>
          <AnimatedTouchableOpacity
            style={[
              styles.colorPreview, 
              { backgroundColor: currentSecondaryColor },
              !canUseColorPicker && styles.colorPreviewDisabled,
              secondaryAnimatedStyle
            ]}
            onPress={() => handleColorPress('secondary')}
            disabled={!canUseColorPicker}
          >
            <Ionicons 
              name={canUseColorPicker ? "color-palette" : "lock-closed"} 
              size={16} 
              color={previewTheme.colors.text}
            />
          </AnimatedTouchableOpacity>
          {!canUseColorPicker && (
            <View style={styles.premiumBadge}>
              <Ionicons name="star" size={12} color={theme.colors.warning} />
              <Text style={styles.premiumText}>PRO</Text>
            </View>
          )}
        </View>
      </View>

      {/* Enhanced Color Preview Section */}
      {canUseColorPicker && (
        <View style={styles.previewSection}>
          <Text style={styles.previewTitle}>Live Preview</Text>
          
          {/* Contrast Information */}
          <View style={[styles.contrastInfo, !hasGoodContrast && styles.contrastWarning]}>
            <Ionicons 
              name={hasGoodContrast ? "checkmark-circle" : "warning"} 
              size={16} 
              color={hasGoodContrast ? theme.colors.success : theme.colors.warning} 
            />
            <Text style={styles.contrastText}>
              Contrast Ratio: {backgroundTextContrast.toFixed(1)}:1 
              {hasGoodContrast ? ' (Excellent)' : ' (Poor - May be hard to read)'}
            </Text>
          </View>

          {/* Theme Preview Cards */}
          <View style={styles.previewCards}>
            {/* Main Card Preview */}
            <View style={[styles.previewCard, { backgroundColor: previewTheme.colors.background }]}>
              <View style={[styles.previewCardHeader, { backgroundColor: previewTheme.colors.surface }]}>
                <Text style={[styles.previewCardTitle, { color: previewTheme.colors.text }]}>
                  Sample Card
                </Text>
                <View style={[styles.previewButton, { backgroundColor: previewTheme.colors.primary }]}>
                  <Text style={styles.previewButtonText}>Button</Text>
                </View>
              </View>
              <View style={styles.previewCardContent}>
                <Text style={[styles.previewCardText, { color: previewTheme.colors.text }]}>
                  Primary text with your custom colors
                </Text>
                <Text style={[styles.previewCardSubtext, { color: previewTheme.colors.textSecondary }]}>
                  Secondary text for descriptions
                </Text>
                <View style={[styles.previewDivider, { backgroundColor: previewTheme.colors.border }]} />
                <View style={styles.previewActions}>
                  <TouchableOpacity style={[styles.previewActionButton, { borderColor: previewTheme.colors.border }]}>
                    <Text style={[styles.previewActionText, { color: previewTheme.colors.textSecondary }]}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.previewActionButton, { backgroundColor: previewTheme.colors.primary }]}>
                    <Text style={[styles.previewActionText]}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Surface Card Preview */}
            <View style={[styles.previewCard, styles.smallPreviewCard, { backgroundColor: previewTheme.colors.surface }]}>
              <Text style={[styles.previewCardTitle, { color: previewTheme.colors.text }]}>
                Surface Card
              </Text>
              <Text style={[styles.previewCardSubtext, { color: previewTheme.colors.textSecondary }]}>
                Elevated surface color
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Color Picker Modal */}
      <ColorPickerModal />
    </Animated.View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
  },
  resetAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
  },
  resetAllButtonText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: theme.colors.primary,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
  },
  settingDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  resetButton: {
    marginTop: theme.spacing.xs,
  },
  resetButtonText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: theme.colors.primary,
  },
  colorControls: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  colorPreview: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  colorPreviewDisabled: {
    opacity: 0.5,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: theme.colors.warning + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  premiumText: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: theme.colors.warning,
  },
  previewSection: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.md,
  },
  previewTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  contrastInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.success + '20',
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
  },
  contrastWarning: {
    backgroundColor: theme.colors.warning + '20',
  },
  contrastText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: theme.colors.text,
    flex: 1,
  },
  previewCards: {
    gap: theme.spacing.sm,
  },
  previewCard: {
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  previewCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  previewCardTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  previewButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
  },
  previewButtonText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: 'white',
  },
  previewCardContent: {
    padding: theme.spacing.md,
    paddingTop: 0,
  },
  previewCardText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginBottom: theme.spacing.xs,
  },
  previewCardSubtext: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  previewDivider: {
    height: 1,
    marginVertical: theme.spacing.md,
  },
  previewActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  previewActionButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  previewActionText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: 'white',
  },
  smallPreviewCard: {
    padding: theme.spacing.md,
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalContainer: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.xl,
    width: '100%',
    maxWidth: 400,
    maxHeight: screenHeight * 0.8,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    flex: 1,
  },
  modalCloseButton: {
    padding: theme.spacing.xs,
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    lineHeight: 20,
  },
  colorGrid: {
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  colorRow: {
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
  },
  modalColorOption: {
    width: 60,
    height: 60,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    position: 'relative',
  },
  selectedModalColorOption: {
    borderWidth: 3,
    borderColor: theme.colors.primary,
    elevation: 4,
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  selectedIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: theme.borderRadius.md,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.textSecondary,
  },
  modalResetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.primary + '20',
    borderRadius: theme.borderRadius.md,
  },
  modalResetText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.primary,
  },
  colorItemContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 4,
  },
});