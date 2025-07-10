import { UserFlags, CreditPack, PurchaseInfo, CreditTransaction } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export interface PurchaseInfo {
  productIdentifier: string;
  purchaseDate: string;
  originalPurchaseDate: string;
  expirationDate?: string;
}

// Credit pack configurations
const CREDIT_PACKS: CreditPack[] = [
  {
    identifier: 'credits_100',
    credits: 100,
    price: '2.99',
    priceString: '$2.99',
    bonus: 0,
    description: '100 credits for basic AI sorting - process up to 900 images',
    title: '100 Credits',
    currencyCode: 'USD',
  },
  {
    identifier: 'credits_500',
    credits: 625, // 500 + 25% bonus
    price: '9.99',
    priceString: '$9.99',
    bonus: 25,
    description: '500 credits + 25% bonus (625 total) - process up to 5,625 images',
    title: '500 Credits + 25% Bonus',
    currencyCode: 'USD',
  },
  {
    identifier: 'credits_1500',
    credits: 2250, // 1500 + 50% bonus
    price: '24.99',
    priceString: '$24.99',
    bonus: 50,
    description: '1500 credits + 50% bonus (2250 total) - process up to 20,250 images',
    title: '1500 Credits + 50% Bonus',
    currencyCode: 'USD',
  },
];

// Credit costs for different operations
export const CREDIT_COSTS = {
  AI_SORT_PER_ATLAS: 1, // 1 credit per 9-image atlas
  NSFW_PROCESSING: 2, // 2-3 credits for NSFW image processing
  NATURAL_LANGUAGE_QUERY: 0.25, // 0.25 credits per query
} as const;

export class CreditPurchaseManager {
  private static instance: CreditPurchaseManager;
  private static USER_FLAGS_KEY = '@snapsort_user_flags';
  private userFlags: UserFlags = {
    creditBalance: 0,
    hasPurchasedCredits: false,
  };

  static getInstance(): CreditPurchaseManager {
    if (!CreditPurchaseManager.instance) {
      CreditPurchaseManager.instance = new CreditPurchaseManager();
    }
    return CreditPurchaseManager.instance;
  }

  async initialize(apiKey: string): Promise<void> {
    console.log('🎯 CreditPurchaseManager initialized with API key:', apiKey);
    await this.loadUserFlags();
  }

  private async loadUserFlags(): Promise<void> {
    try {
      // First try to load from Supabase if user is authenticated
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const creditBalance = await this.getCreditBalanceFromSupabase(user.id);
        const hasPurchasedCredits = await this.checkHasPurchasedCredits(user.id);
        this.userFlags = {
          creditBalance,
          hasPurchasedCredits,
        };
      } else {
        // Fallback to local storage for unauthenticated users
        const stored = await AsyncStorage.getItem(CreditPurchaseManager.USER_FLAGS_KEY);
        if (stored) {
          this.userFlags = JSON.parse(stored);
        }
      }
      
      console.log('💳 Loaded user flags:', this.userFlags);
    } catch (error) {
      console.error('Error loading user flags:', error);
    }
  }

  private async checkHasPurchasedCredits(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'purchase')
        .limit(1);

      if (error) {
        console.error('Error checking purchase history:', error);
        return false;
      }

      return (data && data.length > 0);
    } catch (error) {
      console.error('Error in checkHasPurchasedCredits:', error);
      return false;
    }
  }

  private async saveUserFlags(): Promise<void> {
    try {
      await AsyncStorage.setItem(CreditPurchaseManager.USER_FLAGS_KEY, JSON.stringify(this.userFlags));
      console.log('💾 Saved user flags:', this.userFlags);
    } catch (error) {
      console.error('Error saving user flags:', error);
    }
  }

  private async getCreditBalanceFromSupabase(userId: string): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('get_user_credits', {
        p_user_id: userId
      });

      if (error) {
        console.error('Error fetching credit balance:', error);
        return 0;
      }

      return data?.balance || 0;
    } catch (error) {
      console.error('Error in getCreditBalanceFromSupabase:', error);
      return 0;
    }
  }

  async getUserFlags(): Promise<UserFlags> {
    await this.loadUserFlags();
    return this.userFlags;
  }

  async getCreditPacks(): Promise<CreditPack[]> {
    return CREDIT_PACKS;
  }

  async purchaseProduct(productIdentifier: string): Promise<PurchaseInfo> {
    console.log('🛒 Purchasing credit pack:', productIdentifier);
    
    // Find the credit pack
    const creditPack = CREDIT_PACKS.find(pack => pack.identifier === productIdentifier);
    if (!creditPack) {
      throw new Error('Invalid product identifier');
    }
    
    // Simulate purchase delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User must be authenticated to purchase credits');
    }

    // Add credits to user's balance
    const { data, error } = await supabase.functions.invoke('add-credits', {
      body: {
        user_id: user.id,
        amount: creditPack.credits,
        type: 'purchase',
        description: `Purchased ${creditPack.title}`,
        metadata: {
          product_identifier: productIdentifier,
          base_credits: creditPack.credits - (creditPack.bonus ? Math.floor(creditPack.credits * creditPack.bonus / (100 + creditPack.bonus)) : 0),
          bonus_credits: creditPack.bonus ? Math.floor(creditPack.credits * creditPack.bonus / (100 + creditPack.bonus)) : 0,
          bonus_percentage: creditPack.bonus || 0,
        }
      }
    });

    if (error) {
      throw new Error(`Purchase failed: ${error.message}`);
    }

    if (!data.success) {
      throw new Error(`Purchase failed: ${data.error}`);
    }

    // Update local flags
    this.userFlags.creditBalance = data.new_balance;
    this.userFlags.hasPurchasedCredits = true;
    await this.saveUserFlags();

    const purchaseInfo: PurchaseInfo = {
      productIdentifier,
      purchaseDate: new Date().toISOString(),
      originalPurchaseDate: new Date().toISOString(),
    };

    console.log('✅ Purchase successful:', purchaseInfo);
    return purchaseInfo;
  }

  async deductCredits(
    amount: number, 
    type: 'ai_sort' | 'nsfw_process' | 'query',
    description: string,
    metadata?: Record<string, any>
  ): Promise<{ success: boolean; newBalance?: number; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('deduct-credits', {
        body: {
          amount,
          type,
          description,
          metadata
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        return {
          success: false,
          error: data.error
        };
      }

      // Update local balance
      this.userFlags.creditBalance = data.new_balance;
      await this.saveUserFlags();

      return {
        success: true,
        newBalance: data.new_balance
      };
    } catch (error) {
      console.error('Error deducting credits:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async restorePurchases(): Promise<void> {
    console.log('🔄 Restoring purchases...');
    
    // Simulate restore delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // In a real implementation, this would check with RevenueCat servers
    // For now, we'll just reload from Supabase
    await this.loadUserFlags();
    
    console.log('✅ Purchases restored:', this.userFlags);
  }

  async getCreditBalance(): Promise<number> {
    await this.loadUserFlags();
    return this.userFlags.creditBalance;
  }

  async getCreditTransactions(limit: number = 50): Promise<CreditTransaction[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return [];
      }

      const { data, error } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching credit transactions:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getCreditTransactions:', error);
      return [];
    }
  }

  // Helper methods for checking credit requirements
  canAffordAiSort(atlasCount: number = 1): boolean {
    const cost = atlasCount * CREDIT_COSTS.AI_SORT_PER_ATLAS;
    return this.userFlags.creditBalance >= cost;
  }

  canAffordNsfwProcessing(): boolean {
    return this.userFlags.creditBalance >= CREDIT_COSTS.NSFW_PROCESSING;
  }

  canAffordQuery(): boolean {
    return this.userFlags.creditBalance >= CREDIT_COSTS.NATURAL_LANGUAGE_QUERY;
  }

  getAiSortCost(atlasCount: number = 1): number {
    return atlasCount * CREDIT_COSTS.AI_SORT_PER_ATLAS;
  }

  getNsfwProcessingCost(): number {
    return CREDIT_COSTS.NSFW_PROCESSING;
  }

  getQueryCost(): number {
    return CREDIT_COSTS.NATURAL_LANGUAGE_QUERY;
  }

  // Enhanced testing methods
  async mockPurchase(packIdentifier: string): Promise<void> {
    console.log('🧪 Mock purchase:', packIdentifier);
    
    const creditPack = CREDIT_PACKS.find(pack => pack.identifier === packIdentifier);
    if (!creditPack) {
      throw new Error('Invalid pack identifier');
    }

    this.userFlags.creditBalance += creditPack.credits;
    await this.saveUserFlags();
  }

  // Reset method for testing
  async resetUserFlags(): Promise<void> {
    console.log('🔄 Resetting user flags for testing...');
    
    this.userFlags = {
      creditBalance: 0,
      isProUser: false,
    };

    await this.saveUserFlags();
    console.log('✅ User flags reset to:', this.userFlags);
  }

  // Get current flags without async loading (for immediate UI updates)
  getCurrentFlags(): UserFlags {
    return { ...this.userFlags };
  }
}