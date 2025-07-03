import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { X, Mail, Lock, User, Eye, EyeOff } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useApp } from '../contexts/AppContext';
import { lightTheme } from '../utils/theme';

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialMode?: 'signin' | 'signup';
}

export function AuthModal({ visible, onClose, onSuccess, initialMode = 'signin' }: AuthModalProps) {
  const { signIn, signUp } = useApp();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (mode === 'signup' && !fullName.trim()) {
      Alert.alert('Error', 'Please enter your full name');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        await signUp(email, password, fullName);
      }
      
      onSuccess();
      onClose();
      resetForm();
    } catch (error: any) {
      Alert.alert('Authentication Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setShowPassword(false);
  };

  const toggleMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    resetForm();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView 
        style={styles.overlay} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.View entering={FadeInUp.delay(100)} style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={lightTheme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Animated.View entering={FadeInDown.delay(200)} style={styles.form}>
            {mode === 'signup' && (
              <View style={styles.inputContainer}>
                <User size={20} color={lightTheme.colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Full Name"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  editable={!loading}
                />
              </View>
            )}

            <View style={styles.inputContainer}>
              <Mail size={20} color={lightTheme.colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!loading}
              />
            </View>

            <View style={styles.inputContainer}>
              <Lock size={20} color={lightTheme.colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                editable={!loading}
              />
              <TouchableOpacity 
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
              >
                {showPassword ? (
                  <EyeOff size={20} color={lightTheme.colors.textSecondary} />
                ) : (
                  <Eye size={20} color={lightTheme.colors.textSecondary} />
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Please wait...' : (mode === 'signin' ? 'Sign In' : 'Create Account')}
              </Text>
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                {mode === 'signin' ? "Don't have an account? " : "Already have an account? "}
              </Text>
              <TouchableOpacity onPress={toggleMode} disabled={loading}>
                <Text style={styles.footerLink}>
                  {mode === 'signin' ? 'Sign Up' : 'Sign In'}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: lightTheme.spacing.lg,
  },
  container: {
    backgroundColor: lightTheme.colors.background,
    borderRadius: lightTheme.borderRadius.xl,
    width: '100%',
    maxWidth: 400,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
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
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: lightTheme.colors.text,
  },
  closeButton: {
    padding: lightTheme.spacing.xs,
  },
  form: {
    padding: lightTheme.spacing.lg,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.md,
    marginBottom: lightTheme.spacing.md,
    paddingHorizontal: lightTheme.spacing.md,
    borderWidth: 1,
    borderColor: lightTheme.colors.border,
  },
  inputIcon: {
    marginRight: lightTheme.spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: lightTheme.spacing.md,
    fontSize: 16,
    color: lightTheme.colors.text,
    fontFamily: 'Inter-Regular',
  },
  eyeButton: {
    padding: lightTheme.spacing.xs,
  },
  submitButton: {
    backgroundColor: lightTheme.colors.primary,
    borderRadius: lightTheme.borderRadius.md,
    paddingVertical: lightTheme.spacing.md,
    alignItems: 'center',
    marginTop: lightTheme.spacing.md,
    elevation: 2,
    shadowColor: lightTheme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  submitButtonDisabled: {
    backgroundColor: lightTheme.colors.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: lightTheme.spacing.lg,
  },
  footerText: {
    fontSize: 14,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
  },
  footerLink: {
    fontSize: 14,
    color: lightTheme.colors.primary,
    fontFamily: 'Inter-SemiBold',
  },
});