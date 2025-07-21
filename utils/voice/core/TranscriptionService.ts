import { TranscriptionResult, VoiceError, VoiceErrorCode, VoiceInputCallbacks } from '../types/VoiceTypes';
import { TranscriptionProvider, TranscriptionOptions, OpenAITranscriptionProvider } from '../providers/OpenAITranscriptionProvider';

export interface TranscriptionConfig {
  primaryProvider?: string;
  fallbackProviders?: string[];
  retryAttempts?: number;
  retryDelay?: number;
  timeout?: number;
}

export class TranscriptionService {
  private providers: Map<string, TranscriptionProvider> = new Map();
  private config: TranscriptionConfig;
  private callbacks: VoiceInputCallbacks;

  constructor(config: TranscriptionConfig = {}, callbacks: VoiceInputCallbacks = {}) {
    this.config = {
      primaryProvider: 'openai',
      fallbackProviders: [],
      retryAttempts: 3,
      retryDelay: 1000,
      timeout: 30000,
      ...config
    };
    this.callbacks = callbacks;
    
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Register OpenAI provider
    this.providers.set('openai', new OpenAITranscriptionProvider());
  }

  registerProvider(name: string, provider: TranscriptionProvider): void {
    this.providers.set(name, provider);
  }

  async transcribe(audioUri: string, options: TranscriptionOptions = {}): Promise<TranscriptionResult> {
    this.callbacks.onTranscriptionStart?.();
    
    const providersToTry = [
      this.config.primaryProvider!,
      ...(this.config.fallbackProviders || [])
    ].filter(name => name && this.providers.has(name));

    if (providersToTry.length === 0) {
      const error = new VoiceError({
        code: VoiceErrorCode.TRANSCRIPTION_FAILED,
        message: 'No transcription providers available'
      });
      this.callbacks.onError?.(error);
      throw error;
    }

    let lastError: VoiceError | null = null;

    for (const providerName of providersToTry) {
      const provider = this.providers.get(providerName)!;
      
      if (!provider.isAvailable()) {
        console.warn(`Provider ${providerName} not available, skipping`);
        continue;
      }

      try {
        const result = await this.transcribeWithRetry(provider, audioUri, options);
        this.callbacks.onTranscriptionComplete?.(result);
        return result;
      } catch (error) {
        lastError = error instanceof VoiceError ? error : new VoiceError({
          code: VoiceErrorCode.TRANSCRIPTION_FAILED,
          message: `Provider ${providerName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: error
        });
        
        console.warn(`Transcription failed with provider ${providerName}:`, lastError);
        
        // If this is an API quota error, don't try other providers
        if (lastError.code === VoiceErrorCode.API_QUOTA_EXCEEDED) {
          break;
        }
      }
    }

    // All providers failed
    const finalError = lastError || new VoiceError({
      code: VoiceErrorCode.TRANSCRIPTION_FAILED,
      message: 'All transcription providers failed'
    });
    
    this.callbacks.onError?.(finalError);
    throw finalError;
  }

  private async transcribeWithRetry(
    provider: TranscriptionProvider, 
    audioUri: string, 
    options: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts!; attempt++) {
      try {
        // Add timeout to the transcription
        const transcriptionPromise = provider.transcribe(audioUri, options);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new VoiceError({
              code: VoiceErrorCode.TRANSCRIPTION_FAILED,
              message: 'Transcription timeout'
            }));
          }, this.config.timeout);
        });

        const result = await Promise.race([transcriptionPromise, timeoutPromise]);
        return result;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        // Don't retry on certain error types
        if (error instanceof VoiceError) {
          if ([
            VoiceErrorCode.PERMISSION_DENIED,
            VoiceErrorCode.API_QUOTA_EXCEEDED,
            VoiceErrorCode.INVALID_AUDIO
          ].includes(error.code)) {
            throw error;
          }
        }
        
        // Wait before retrying (except on last attempt)
        if (attempt < this.config.retryAttempts!) {
          await this.delay(this.config.retryDelay! * attempt);
        }
      }
    }
    
    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.entries())
      .filter(([_, provider]) => provider.isAvailable())
      .map(([name, _]) => name);
  }

  isAvailable(): boolean {
    return this.getAvailableProviders().length > 0;
  }

  updateConfig(config: Partial<TranscriptionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  updateCallbacks(callbacks: VoiceInputCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
}
