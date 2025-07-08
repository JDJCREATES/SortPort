// Web-safe version - no LangChain dependencies
export interface LangChainResult {
  id: string;
  description: string;
  category: string;
  nsfwScore: number;
  tags: string[];
  confidence: number;
}

export interface AlbumOutput {
  albums: any[];
  unsorted: string[];
}

export class LangChainAgent {
  private static instance: LangChainAgent;
  
  static getInstance(): LangChainAgent {
    if (!LangChainAgent.instance) {
      LangChainAgent.instance = new LangChainAgent();
    }
    return LangChainAgent.instance;
  }

  async initialize(): Promise<void> {
    console.log('🌐 LangChain Agent: Web version initialized (mock)');
  }

  async transcribeAudio(audioUri: string): Promise<string> {
    throw new Error('Voice transcription is not available on web. Please use the mobile app.');
  }

  async analyzeImage(base64: string, imageId: string): Promise<LangChainResult> {
    throw new Error('Image analysis is not available on web. Please use the mobile app.');
  }

  async batchAnalyzeImages(
    images: Array<{id: string, base64: string}>,
    onProgress?: (completed: number, total: number) => void
  ): Promise<LangChainResult[]> {
    throw new Error('Batch image analysis is not available on web. Please use the mobile app.');
  }

  filterNSFW(results: LangChainResult[], hasUnlockPack: boolean): LangChainResult[] {
    return results;
  }

  groupResults(results: LangChainResult[], userPrompt?: string): AlbumOutput {
    return { albums: [], unsorted: [] };
  }
}