import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Dimensions,
  Platform,
  InteractionManager,
  LayoutAnimation,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  FadeInUp,
  FadeInDown,
  SlideInRight,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useApp } from '../../contexts/AppContext';
import { ResponsiveAlbumGrid } from '../../components/ResponsiveAlbumGrid';
import { AlbumViewModeSelector } from '../../components/AlbumViewModeSelector';
import { lightTheme } from '../../utils/theme';
import { Album } from '../../types';
import { AlbumViewMode } from '../../types/display';
import { NsfwAlbumNaming } from '../../utils/moderation/nsfwAlbumNaming';

const { width: screenWidth } = Dimensions.get('window');

interface NsfwAlbumsScreenState {
  isRefreshing: boolean;
  searchQuery: string;
  sortBy: 'name' | 'date' | 'count';
  sortOrder: 'asc' | 'desc';
  retryCount: number;
  hasError: boolean;
  errorMessage: string;
  viewMode: AlbumViewMode;
  showViewModeSelector: boolean;
  isInitialLoad: boolean;
  hasAcceptedWarning: boolean;
}

export default function NsfwAlbumsScreen() {
  const { albums, isLoadingAlbums, refreshAlbums, userFlags, settings } = useApp();

  const [state, setState] = useState<NsfwAlbumsScreenState>({
    isRefreshing: false,
    searchQuery: '',
    sortBy: 'date',
    sortOrder: 'desc',
    retryCount: 0,
    hasError: false,
    errorMessage: '',
    viewMode: 'grid-2',
    showViewModeSelector: false,
    isInitialLoad: true,
    hasAcceptedWarning: false,
  });

  // Rest of the code remains the same...

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      {renderViewModeSelector()}

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={state.isRefreshing}
            onRefresh={() => handleRefresh(true)}
            tintColor={lightTheme.colors.warning}
            title="Pull to refresh"
            titleColor={lightTheme.colors.textSecondary}
            progressBackgroundColor={lightTheme.colors.surface}
          />
        }
        keyboardShouldPersistTaps="handled"
        accessible={true}
        accessibilityLabel="NSFW albums list"
      >
        {renderContent()}
        {renderFooter()}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Styles remain the same...
});