import React from 'react';
import { TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lightTheme } from '../utils/theme';

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
  color = lightTheme.colors.textSecondary 
}: InfoIconProps) {
  const handlePress = () => {
    Alert.alert(title, message, [{ text: 'OK' }]);
  };

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress}>
      <Ionicons name="information-circle" size={size} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: lightTheme.spacing.xs,
    marginLeft: lightTheme.spacing.xs,
  },
});