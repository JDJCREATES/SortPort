import { Platform } from 'react-native';
import { AudioRecorderAdapter } from '../types/AudioTypes';
import { ExpoAudioAdapter } from './ExpoAudioAdapter';
import { WebAudioAdapter } from './WebAudioAdapter';
import { VoiceError, VoiceErrorCode } from '../types/VoiceTypes';

export class PlatformAudioFactory {
  private static adapters: Map<string, AudioRecorderAdapter> = new Map();

  static createAdapter(): AudioRecorderAdapter {
    const platformKey = Platform.OS;
    
    // Return existing adapter if available
    if (this.adapters.has(platformKey)) {
      return this.adapters.get(platformKey)!;
    }

    let adapter: AudioRecorderAdapter;

    switch (Platform.OS) {
      case 'ios':
      case 'android':
        adapter = new ExpoAudioAdapter();
        break;
      case 'web':
        adapter = new WebAudioAdapter();
        break;
      default:
        throw new VoiceError({
          code: VoiceErrorCode.UNSUPPORTED_PLATFORM,
          message: `Platform ${Platform.OS} is not supported for audio recording`
        });
    }

    // Cache the adapter
    this.adapters.set(platformKey, adapter);
    return adapter;
  }

  static getAvailableAdapter(): AudioRecorderAdapter | null {
    try {
      const adapter = this.createAdapter();
      return adapter.isAvailable() ? adapter : null;
    } catch {
      return null;
    }
  }

  static clearCache(): void {
    this.adapters.clear();
  }

  static async cleanupAll(): Promise<void> {
    const cleanupPromises = Array.from(this.adapters.values()).map(adapter => 
      adapter.cleanup().catch(console.warn)
    );
    
    await Promise.all(cleanupPromises);
    this.clearCache();
  }
}
