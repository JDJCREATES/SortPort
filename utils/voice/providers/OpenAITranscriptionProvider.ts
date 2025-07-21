import { TranscriptionResult, VoiceError, VoiceErrorCode } from '../types/VoiceTypes';

export interface TranscriptionProvider {
  transcribe(audioUri: string, options?: TranscriptionOptions): Promise<TranscriptionResult>;
  isAvailable(): boolean;
  getName(): string;
}

export interface TranscriptionOptions {
  language?: string;
  model?: string;
  temperature?: number;
  prompt?: string;
}

export class OpenAITranscriptionProvider implements TranscriptionProvider {
  private apiKey: string;
  private baseUrl: string = 'https://api.openai.com/v1';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
  }

  async transcribe(audioUri: string, options: TranscriptionOptions = {}): Promise<TranscriptionResult> {
    if (!this.isAvailable()) {
      throw new VoiceError({
        code: VoiceErrorCode.TRANSCRIPTION_FAILED,
        message: 'OpenAI API key not configured'
      });
    }

    try {
      const formData = new FormData();
      
      // Create file object for the audio
      const audioFile = {
        uri: audioUri,
        type: 'audio/m4a',
        name: 'audio.m4a',
      } as any;
      
      formData.append('file', audioFile);
      formData.append('model', options.model || 'whisper-1');
      formData.append('response_format', 'verbose_json');
      
      if (options.language) {
        formData.append('language', options.language);
      }
      
      if (options.temperature !== undefined) {
        formData.append('temperature', options.temperature.toString());
      }
      
      if (options.prompt) {
        formData.append('prompt', options.prompt);
      }

      const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.text();
        
        // Handle specific error cases
        if (response.status === 401) {
          throw new VoiceError({
            code: VoiceErrorCode.TRANSCRIPTION_FAILED,
            message: 'Invalid OpenAI API key'
          });
        }
        
        if (response.status === 429) {
          throw new VoiceError({
            code: VoiceErrorCode.API_QUOTA_EXCEEDED,
            message: 'OpenAI API quota exceeded'
          });
        }
        
        throw new VoiceError({
          code: VoiceErrorCode.TRANSCRIPTION_FAILED,
          message: `OpenAI API error: ${response.statusText}`,
          details: errorData
        });
      }

      const data = await response.json();
      
      if (!data.text) {
        throw new VoiceError({
          code: VoiceErrorCode.TRANSCRIPTION_FAILED,
          message: 'No transcription text received from OpenAI'
        });
      }

      return {
        text: data.text.trim(),
        confidence: this.calculateConfidence(data),
        language: data.language || options.language,
        duration: data.duration,
      };
      
    } catch (error) {
      if (error instanceof VoiceError) {
        throw error;
      }
      
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new VoiceError({
          code: VoiceErrorCode.NETWORK_ERROR,
          message: 'Network error while transcribing audio'
        });
      }
      
      throw new VoiceError({
        code: VoiceErrorCode.TRANSCRIPTION_FAILED,
        message: 'Failed to transcribe audio with OpenAI',
        details: error
      });
    }
  }

  isAvailable(): boolean {
    return this.apiKey !== '' && this.apiKey !== 'your_openai_api_key_here';
  }

  getName(): string {
    return 'OpenAI Whisper';
  }

  private calculateConfidence(data: any): number {
    // OpenAI doesn't provide confidence scores directly
    // We can estimate based on available data
    if (data.segments && Array.isArray(data.segments)) {
      const avgConfidence = data.segments.reduce((sum: number, segment: any) => {
        return sum + (segment.avg_logprob || -1);
      }, 0) / data.segments.length;
      
      // Convert log probability to confidence (rough approximation)
      return Math.max(0, Math.min(1, (avgConfidence + 1) / 2));
    }
    
    // Default confidence if no segments available
    return data.text && data.text.length > 0 ? 0.8 : 0.5;
  }

  updateApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }
}
