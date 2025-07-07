declare global {
  namespace NodeJS {
    interface ProcessEnv {
      EXPO_PUBLIC_OPENAI_API_KEY: string;
      EXPO_PUBLIC_REVENUECAT_API_KEY: string;
      EXPO_PUBLIC_REVENUECAT_IOS_KEY: string;
      EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: string;
      EXPO_PUBLIC_SUPABASE_URL: string;
      EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
      AWS_ACCESS_KEY_ID: string;
      AWS_SECRET_ACCESS_KEY: string;
      AWS_REGION: string;
    }
  }
}

export {};