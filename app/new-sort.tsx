import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { router, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PictureHackBar } from '../components/PictureHackBar';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { AlbumCard } from '../components/AlbumCard';
import { PhotoLoader, PermissionStatus } from '../utils/photoLoader';
import { LangChainAgent } from '../utils/langchainAgent';
import { AlbumUtils } from '../utils/albumUtils';
import { CreditPurchaseManager, CREDIT_COSTS } from '../utils/creditPurchaseManager';
import { useApp } from '../contexts/AppContext';
import { ImageMeta, AlbumOutput, SortSession } from '../types';
import { getCurrentTheme } from '../utils/theme';

export default function NewSortScreen() {
  const { userFlags, deductCredits } = useApp();
  const params = useLocalSearchParams();
  const navigationRouter = useRouter();
  const initialPrompt = params.prompt as string || '';
  const theme = getCurrentTheme();

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentMessage, setCurrentMessage] = useState('');
  const [results, setResults] = useState<AlbumOutput | null>(null);
  const [photos, setPhotos] = useState<ImageMeta[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState(initialPrompt);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');

  useEffect(() => {
    loadPhotos();
    if (initialPrompt) {
      handleSort(initialPrompt);
    }
  }, []);

  const loadPhotos = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // First check permissions
      const status = await PhotoLoader.requestPermissions();
      setPermissionStatus(status);
      
      if (status !== 'granted') {
        if (status === 'denied') {
          setError('Photo library access denied. Please enable photo permissions in your device settings to use AI sorting.');
        } else {
          setError('Photo library permission required. Please grant access to your photos to continue.');
        }
        setPhotos([]);
        return;
      }
      
      // Load photos if permissions are granted
      const recentPhotos = await PhotoLoader.loadRecentPhotos(50);
      setPhotos(recentPhotos);
      
      if (recentPhotos.length === 0) {
        setError('No photos found on your device. Please add some photos to your gallery and try again.');
      }
    } catch (error: any) {
      console.error('Error loading photos:', error);
      setError(error.message || 'Failed to load photos. Please check your permissions and try again.');
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = async (prompt: string) => {
    if (photos.length === 0 && permissionStatus === 'granted') {
      Alert.alert('No Photos', 'No photos found to sort. Please add some photos to your gallery and try again.');
      return;
    }
    
    if (permissionStatus !== 'granted') {
      Alert.alert('Permission Required', 'Please grant photo library access to use AI sorting.');
      return;
    }

    // Calculate credit cost
    const limitedImages = photos.slice(0, 20);
    const atlasCount = Math.ceil(limitedImages.length / 9);
    const totalCost = atlasCount * CREDIT_COSTS.AI_SORT_PER_ATLAS;

    // Check if user has sufficient credits
    if (userFlags.creditBalance < totalCost) {
      Alert.alert(
        'Insufficient Credits',
        `You need ${totalCost} credits to sort ${limitedImages.length} images (${atlasCount} atlases). You currently have ${userFlags.creditBalance} credits. Please purchase more credits to continue.`,
        [{ text: 'OK' }]
      );
      return;
    }

    setCurrentPrompt(prompt);
    setIsProcessing(true);
    setProgress(0);
    setCurrentMessage('Initializing AI sorting...');
    setResults(null);
    setError(null);

    try {
      // Initialize LangChain agent
      const agent = new LangChainAgent();

      setCurrentMessage('Analyzing photos with AI...');

      // Sort images
      const sortResults = await agent.sortImages(
        prompt,
        photos,
        userFlags,
        deductCredits,
        (completed, total) => {
          const progressPercent = (completed / total) * 100;
          setProgress(progressPercent);
          setCurrentMessage(`Analyzing photo ${completed} of ${total}...`);
        }
      );

      setCurrentMessage('Organizing albums...');
      setProgress(100);

      // Set results
      setResults(sortResults);

      // Save sort session
      const session: SortSession = {
        id: `session_${Date.now()}`,
        prompt,
        timestamp: Date.now(),
        results: sortResults,
        processingTime: 0, // Calculate if needed
      };

      await AlbumUtils.saveSortSession(session);
      
      setCurrentMessage('Complete!');
      
      // Hide loading after a brief delay
      setTimeout(() => {
        setIsProcessing(false);
      }, 1000);

    } catch (error: any) {
      console.error('Error sorting photos:', error);
      setIsProcessing(false);
      setError(error.message || 'Failed to sort photos. Please check your API configuration.');
      Alert.alert(
        'Sorting Failed',
        error.message || 'There was an error sorting your photos. Please try again.'
      );
    }
  };

  const handleSaveAlbums = async () => {
    if (!results) return;

    try {
      // Save each album
      for (const album of results.albums) {
        await AlbumUtils.addAlbum(album);
      }

      Alert.alert(
        'Albums Saved!',
        `Successfully created ${results.albums.length} albums.`,
        [
          {
            text: 'View Albums',
            onPress: () => router.push('/(tabs)/albums'),
          },
          {
            text: 'Go Home',
            onPress: () => router.push('/(tabs)'),
          },
        ]
      );
    } catch (error) {
      console.error('Error saving albums:', error);
      Alert.alert('Error', 'Failed to save albums. Please try again.');
    }
  };

  const handleAlbumPress = (album: any) => {
    // For now, just show info
    Alert.alert(
      album.name,
      `${album.count} photos\nTags: ${album.tags.join(', ')}`,
      [
        { text: 'OK' },
        {
          text: 'Save This Album',
          onPress: async () => {
            try {
              await AlbumUtils.addAlbum(album);
              Alert.alert('Saved!', `"${album.name}" has been saved to your albums.`);
            } catch (error) {
              Alert.alert('Error', 'Failed to save album.');
            }
          },
        },
      ]
    );
  };

  const handleRetryLoadPhotos = () => {
    loadPhotos();
  };
  
  const handleBackPress = () => {
    if (navigationRouter.canGoBack()) {
      navigationRouter.back();
    } else {
      navigationRouter.replace('/(tabs)');
    }
  };

  // Create styles with current theme
  const styles = createStyles(theme);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
         <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>New Sort</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.promptSection}>
          <View style={styles.promptHeader}>
            <Ionicons name="sparkles" size={20} color={theme.colors.primary} />
            <Text style={styles.promptTitle}>AI Photo Sorting</Text>
          </View>
          <Text style={styles.promptDescription}>
            Describe what you want to sort or let AI automatically categorize your photos
          </Text>
          
          <PictureHackBar 
            onSubmit={handleSort}
            placeholder="Sort my vacation photos, receipts, screenshots..."
            disabled={isProcessing}
          />

          {currentPrompt && !isProcessing && (
            <View style={styles.currentPromptContainer}>
              <Text style={styles.currentPromptLabel}>Current Sort:</Text>
              <Text style={styles.currentPromptText}>"{currentPrompt}"</Text>
            </View>
          )}
        </View>

        {loading && (
          <View style={styles.loadingSection}>
            <Text style={styles.loadingText}>Loading photos...</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorSection}>
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color={theme.colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
            {(permissionStatus !== 'granted' || photos.length === 0) && (
              <TouchableOpacity style={styles.retryButton} onPress={handleRetryLoadPhotos}>
                <Text style={styles.retryButtonText}>
                  {permissionStatus !== 'granted' ? 'Grant Permissions' : 'Retry Loading Photos'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {results && !isProcessing && (
          <View style={styles.resultsSection}>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>Sort Results</Text>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveAlbums}>
            <Ionicons name="save" size={16} color="white" />
                <Text style={styles.saveButtonText}>Save All</Text>
              </TouchableOpacity>
            </View>

            {results.albums.length > 0 ? (
              <View style={styles.albumGrid}>
                {results.albums.map((album, index) => (
                  <AlbumCard
                    key={`${album.id}_${index}`}
                    album={album}
                    onPress={() => handleAlbumPress(album)}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.noResultsContainer}>
                <Text style={styles.noResultsTitle}>No Albums Created</Text>
                <Text style={styles.noResultsText}>
                  Try a different prompt or check if you have photos that match your criteria.
                </Text>
              </View>
            )}

            {results.unsorted.length > 0 && (
              <View style={styles.unsortedSection}>
                <Text style={styles.unsortedTitle}>
                  {results.unsorted.length} photos couldn't be categorized
                </Text>
                <Text style={styles.unsortedText}>
                  These photos didn't match any category or had low confidence scores.
                </Text>
              </View>
            )}
          </View>
        )}

        {!results && !isProcessing && !error && !loading && photos.length > 0 && (
          <View style={styles.welcomeSection}>
            <Text style={styles.welcomeTitle}>Welcome to AI Sorting!</Text>
            <Text style={styles.welcomeText}>
              • Use natural language to describe what you want to sort
            </Text>
            <Text style={styles.welcomeText}>
              • AI will analyze your photos and create smart albums
            </Text>
            <Text style={styles.welcomeText}>
              • Preview results before saving to your collection
            </Text>
            
            <View style={styles.examplePrompts}>
              <Text style={styles.exampleTitle}>Example prompts:</Text>
              <TouchableOpacity 
                style={styles.examplePrompt}
                onPress={() => handleSort("Sort my receipts and bills")}
              >
                <Text style={styles.examplePromptText}>"Sort my receipts and bills"</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.examplePrompt}
                onPress={() => handleSort("Organize my travel photos")}
              >
                <Text style={styles.examplePromptText}>"Organize my travel photos"</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.examplePrompt}
                onPress={() => handleSort("Find all screenshots")}
              >
                <Text style={styles.examplePromptText}>"Find all screenshots"</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        
        {!results && !isProcessing && !error && !loading && photos.length === 0 && permissionStatus === 'granted' && (
          <View style={styles.welcomeSection}>
            <Text style={styles.welcomeTitle}>No Photos Found</Text>
            <Text style={styles.welcomeText}>
              • Add some photos to your device gallery
            </Text>
            <Text style={styles.welcomeText}>
              • Make sure photos are saved to your device
            </Text>
            <Text style={styles.welcomeText}>
              • Try taking a few photos with your camera
            </Text>
            
            <TouchableOpacity style={styles.retryButton} onPress={handleRetryLoadPhotos}>
              <Text style={styles.retryButtonText}>Check Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <LoadingOverlay
        visible={isProcessing}
        progress={progress}
        message={currentMessage}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    padding: theme.spacing.sm,
    marginLeft: -theme.spacing.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  promptSection: {
    padding: theme.spacing.lg,
  },
  promptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  promptTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  promptDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
    lineHeight: 20,
  },
  currentPromptContainer: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  currentPromptLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  currentPromptText: {
    fontSize: 14,
    color: theme.colors.text,
    fontStyle: 'italic',
  },
  loadingSection: {
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  errorSection: {
    padding: theme.spacing.lg,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.error + '10',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.error + '30',
    gap: theme.spacing.sm,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.error,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  resultsSection: {
    padding: theme.spacing.lg,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  resultsTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.xs,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  albumGrid: {
    gap: theme.spacing.md,
  },
  noResultsContainer: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  noResultsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  noResultsText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  unsortedSection: {
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.warning + '10',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.warning + '30',
  },
  unsortedTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.warning,
    marginBottom: theme.spacing.xs,
  },
  unsortedText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 16,
  },
  welcomeSection: {
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  welcomeText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    lineHeight: 22,
  },
  examplePrompts: {
    marginTop: theme.spacing.xl,
    width: '100%',
  },
  exampleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  examplePrompt: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  examplePromptText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '500',
  },
});