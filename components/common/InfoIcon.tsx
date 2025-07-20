import React from 'react';
import { TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeManager } from '../../utils/theme';

interface InfoIconProps {
  message: string;
  title?: string;
  size?: number;
  color?: string;
}

export function InfoIcon({ 
  message, 
  title = 'Information', 
  size = 16, 
  color 
}: InfoIconProps) {
  const theme = ThemeManager.getInstance().getCurrentTheme();
  const iconColor = color || theme.colors.textSecondary;

  const handlePress = () => {
    Alert.alert(title, message, [{ text: 'OK' }]);
  };

  const styles = StyleSheet.create({
    container: {
      padding: theme.spacing.xs,
      marginLeft: theme.spacing.xs,
    },
  });

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress}>
      <Ionicons name="information-circle" size={size} color={iconColor} />
    </TouchableOpacity>
  );
}