import { Platform } from 'react-native';

// Platform-specific imports
let LangChainAgent: any;
let LangChainResult: any;
let AlbumOutput: any;

if (Platform.OS === 'web') {
  // Import web version
  const webModule = require('../langchainAgent.web');
  LangChainAgent = webModule.LangChainAgent;
  LangChainResult = webModule.LangChainResult;
  AlbumOutput = webModule.AlbumOutput;
} else {
  // Import native version
  const nativeModule = require('../langchainAgent');
  LangChainAgent = nativeModule.LangChainAgent;
  LangChainResult = nativeModule.LangChainResult;
  AlbumOutput = nativeModule.AlbumOutput;
}

// Re-export for use
export { LangChainAgent };
export type { LangChainResult, AlbumOutput };