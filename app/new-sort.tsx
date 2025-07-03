import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Wand as Wand2, Save, CircleAlert as AlertCircle } from 'lucide-react-native';
import { PictureHackBar } from '../components/PictureHackBar';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { AlbumCard } from '../components/AlbumCard';
import { PhotoLoader } from '../utils/photoLoader';
import { LangChainAgent } from '../utils/langchainAgent';
import { AlbumUtils } from '../utils/albumUtils';
import { RevenueCatManager } from '../utils/revenuecat';
import { ImageMeta, AlbumOutput, SortSession } from '../types';
import { lightTheme } from '../utils/theme';

export default function NewSortScreen() {
  const params = useLocalSearchParams();
  const initialPrompt = params.prompt as string || '';

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentMessage, setCurrentMessage] = useState('');
  const [results, setResults] = useState<AlbumOutput | null>(null);
  const [photos, setPhotos] = useState<ImageMeta[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState(initialPrompt);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPhotos();
    if (initialPrompt) {
      handleSort(initialPrompt);
    }
  }, []);

  const loadPhotos = async () => {
    try {
      setError(null);
      const recentPhotos = await PhotoLoader.loadRecentPhotos(50);
      setPhotos(recentPhotos);
      
      if (recentPhotos.length === 0) {
        setError('No photos found. Please ensure you have photos in your gallery and have granted photo library permissions.');
      }
    } catch (error: any) {
      console.error('Error loading photos:', error);
      setError(error.message || 'Failed to load photos. Please check permissions.');
      setPhotos([]);
    }
  };

  const handleSort = async (prompt: string) => {
    if (photos.length === 0) {
      Alert.alert('No Photos', 'No photos found to sort. Please ensure you have photos in your gallery and have granted photo library permissions.');
      return;
    }

    setCurrentPrompt(prompt);
    setIsProcessing(true);
    setProgress(0);
    setCurrentMessage('Initializing AI sorting...');
    setResults(null);
    setError(null);

    try {
      // Get user flags
      const revenueCat = RevenueCatManager.getInstance();
      const userFlags = await revenueCat.getUserFlags();

      // Initialize LangChain agent
      const agent = new LangChainAgent();

      setCurrentMessage('Analyzing photos with AI...');

      // Sort images
      const sortResults = await agent.sortImages(
        prompt,
        photos,
        userFlags,
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
        error.message || 'There was an error sorting your photos. Please check your OpenAI API key configuration and try again.'
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={lightTheme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>New Sort</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.promptSection}>
          <View style={styles.promptHeader}>
            <Wand2 size={20} color={lightTheme.colors.primary} />
            <Text style={styles.promptTitle}>AI Photo Sorting</Text>
          </View>
          <Text style={styles.promptDescription}>
            Describe what you want to sort or let AI automatically categorize your photos
          </Text>
          
          <PictureHackBar 
            onSubmit={handleSort}
            placeholder="Sort my vacation photos, receipts, screenshots..."
            disabled={isProcessing || photos.length === 0}
          />

          {currentPrompt && !isProcessing && (
            <View style={styles.currentPromptContainer}>
              <Text style={styles.currentPromptLabel}>Current Sort:</Text>
              <Text style={styles.currentPromptText}>"{currentPrompt}"</Text>
            </View>
          )}
        </View>

        {error && (
          <View style={styles.errorSection}>
            <View style={styles.errorContainer}>
              <AlertCircle size={20} color={lightTheme.colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
            {photos.length === 0 && (
              <TouchableOpacity style={styles.retryButton} onPress={handleRetryLoadPhotos}>
                <Text style={styles.retryButtonText}>Retry Loading Photos</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {results && !isProcessing && (
          <View style={styles.resultsSection}>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>Sort Results</Text>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveAlbums}>
                <Save size={16} color="white" />
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

        {!results && !isProcessing && !error && photos.length > 0 && (
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
      </ScrollView>

      <LoadingOverlay
        visible={isProcessing}
        progress={progress}
        message={currentMessage}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightTheme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: lightTheme.spacing.lg,
    paddingVertical: lightTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.colors.border,
  },
  backButton: {
    padding: lightTheme.spacing.sm,
    marginLeft: -lightTheme.spacing.sm,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
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
    padding: lightTheme.spacing.lg,
  },
  promptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: lightTheme.spacing.sm,
  },
  promptTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginLeft: lightTheme.spacing.sm,
  },
  promptDescription: {
    fontSize: 14,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    marginBottom: lightTheme.spacing.lg,
    lineHeight: 20,
  },
  currentPromptContainer: {
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.md,
    padding: lightTheme.spacing.md,
    marginTop: lightTheme.spacing.md,
  },
  currentPromptLabel: {
    fontSize: 12,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Medium',
    marginBottom: lightTheme.spacing.xs,
  },
  currentPromptText: {
    fontSize: 14,
    color: lightTheme.colors.text,
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
  },
  errorSection: {
    padding: lightTheme.spacing.lg,
    paddingTop: 0,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${lightTheme.colors.error}15`,
    borderRadius: lightTheme.borderRadius.md,
    padding: lightTheme.spacing.md,
    gap: lightTheme.spacing.sm,
    marginBottom: lightTheme.spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: lightTheme.colors.error,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: lightTheme.colors.primary,
    borderRadius: lightTheme.borderRadius.md,
    paddingVertical: lightTheme.spacing.md,
    alignItems: 'center',
  },
  retryButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  resultsSection: {
    padding: lightTheme.spacing.lg,
    paddingTop: 0,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: lightTheme.spacing.md,
  },
  resultsTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightTheme.colors.primary,
    paddingHorizontal: lightTheme.spacing.md,
    paddingVertical: lightTheme.spacing.sm,
    borderRadius: lightTheme.borderRadius.md,
    gap: lightTheme.spacing.xs,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  albumGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  noResultsContainer: {
    alignItems: 'center',
    paddingVertical: lightTheme.spacing.xl,
  },
  noResultsTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.sm,
  },
  noResultsText: {
    fontSize: 14,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    paddingHorizontal: lightTheme.spacing.lg,
  },
  unsortedSection: {
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.md,
    padding: lightTheme.spacing.md,
    marginTop: lightTheme.spacing.md,
  },
  unsortedTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.xs,
  },
  unsortedText: {
    fontSize: 12,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
  },
  welcomeSection: {
    padding: lightTheme.spacing.lg,
    paddingTop: 0,
  },
  welcomeTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.md,
  },
  welcomeText: {
    fontSize: 14,
    color: lightTheme.colors.textSecondary,
    fontFamily: 'Inter-Regular',
    marginBottom: lightTheme.spacing.sm,
    lineHeight: 20,
  },
  examplePrompts: {
    marginTop: lightTheme.spacing.lg,
  },
  exampleTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: lightTheme.colors.text,
    marginBottom: lightTheme.spacing.sm,
  },
  examplePrompt: {
    backgroundColor: lightTheme.colors.surface,
    borderRadius: lightTheme.borderRadius.md,
    padding: lightTheme.spacing.md,
    marginBottom: lightTheme.spacing.sm,
  },
  examplePromptText: {
    fontSize: 14,
    color: lightTheme.colors.primary,
    fontFamily: 'Inter-Regular',
  },
});