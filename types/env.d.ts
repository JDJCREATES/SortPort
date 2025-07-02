declare global {
  namespace NodeJS {
    interface ProcessEnv {
      EXPO_PUBLIC_OPENAI_API_KEY: string;
      EXPO_PUBLIC_REVENUECAT_API_KEY: string;
      EXPO_PUBLIC_REVENUECAT_IOS_KEY: string;
      EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: string;
    }
  }
}

export {};