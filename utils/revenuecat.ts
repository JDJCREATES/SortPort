import { UserFlags, RevenueCatProduct, PurchaseInfo } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Enhanced mock implementation with persistent storage for testing
export class RevenueCatManager {
  private static instance: RevenueCatManager;
  private static USER_FLAGS_KEY = '@snapsort_user_flags';
  private userFlags: UserFlags = {
    isSubscribed: false,
    hasUnlockPack: false
  };

  static getInstance(): RevenueCatManager {
    if (!RevenueCatManager.instance) {
      RevenueCatManager.instance = new RevenueCatManager();
    }
    return RevenueCatManager.instance;
  }

  async initialize(apiKey: string): Promise<void> {
    console.log('RevenueCat initialized with API key:', apiKey);
    await this.loadUserFlags();
  }

  private async loadUserFlags(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(RevenueCatManager.USER_FLAGS_KEY);
      if (stored) {
        this.userFlags = JSON.parse(stored);
        console.log('📱 Loaded user flags:', this.userFlags);
      }
    } catch (error) {
      console.error('Error loading user flags:', error);
    }
  }

  private async saveUserFlags(): Promise<void> {
    try {
      await AsyncStorage.setItem(RevenueCatManager.USER_FLAGS_KEY, JSON.stringify(this.userFlags));
      console.log('💾 Saved user flags:', this.userFlags);
    } catch (error) {
      console.error('Error saving user flags:', error);
    }
  }

  async getUserFlags(): Promise<UserFlags> {
    await this.loadUserFlags();
    return this.userFlags;
  }

  async getProducts(): Promise<RevenueCatProduct[]> {
    // Mock products with more realistic data
    return [
      {
        identifier: 'snapsort_pro_monthly',
        description: 'SnapSort Pro Monthly Subscription - Unlimited AI sorting, custom themes, and advanced features',
        title: 'SnapSort Pro Monthly',
        price: '2.99',
        priceString: '$2.99/month',
        currencyCode: 'USD',
      },
      {
        identifier: 'snapsort_pro_yearly',
        description: 'SnapSort Pro Yearly Subscription - Save 50% with annual billing',
        title: 'SnapSort Pro Yearly',
        price: '19.99',
        priceString: '$19.99/year',
        currencyCode: 'USD',
      },
      {
        identifier: 'unlock_pack',
        description: 'SnapSort Unlock Pack - One-time purchase for premium features',
        title: 'Unlock Pack',
        price: '9.99',
        priceString: '$9.99',
        currencyCode: 'USD',
      },
    ];
  }

  async purchaseProduct(productIdentifier: string): Promise<PurchaseInfo> {
    console.log('🛒 Purchasing product:', productIdentifier);
    
    // Simulate purchase delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Update local flags based on purchase
    if (productIdentifier === 'snapsort_pro_monthly' || productIdentifier === 'snapsort_pro_yearly') {
      this.userFlags.isSubscribed = true;
    } else if (productIdentifier === 'unlock_pack') {
      this.userFlags.hasUnlockPack = true;
    }

    await this.saveUserFlags();

    const purchaseInfo: PurchaseInfo = {
      productIdentifier,
      purchaseDate: new Date().toISOString(),
      originalPurchaseDate: new Date().toISOString(),
      expirationDate: productIdentifier.includes('monthly') 
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : productIdentifier.includes('yearly')
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        : undefined,
    };

    console.log('✅ Purchase successful:', purchaseInfo);
    return purchaseInfo;
  }

  async restorePurchases(): Promise<void> {
    console.log('🔄 Restoring purchases...');
    
    // Simulate restore delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // In a real implementation, this would check with RevenueCat servers
    // For testing, we'll just reload from storage
    await this.loadUserFlags();
    
    console.log('✅ Purchases restored:', this.userFlags);
  }

  async checkSubscriptionStatus(): Promise<boolean> {
    await this.loadUserFlags();
    return this.userFlags.isSubscribed;
  }

  async hasUnlockPack(): Promise<boolean> {
    await this.loadUserFlags();
    return this.userFlags.hasUnlockPack;
  }

  // Enhanced testing methods
  async mockPurchase(type: 'subscription' | 'yearly' | 'unlock'): Promise<void> {
    console.log('🧪 Mock purchase:', type);
    
    if (type === 'subscription') {
      this.userFlags.isSubscribed = true;
      
    } else if (type === 'yearly') {
      this.userFlags.isSubscribed = true;
      
    } else if (type === 'unlock') {
      this.userFlags.hasUnlockPack = true;
      
    }

    await this.saveUserFlags();
  }

  // Reset method for testing
  async resetUserFlags(): Promise<void> {
    console.log('🔄 Resetting user flags for testing...');
    
    this.userFlags = {
      isSubscribed: false,
      hasUnlockPack: false
    };

    await this.saveUserFlags();
    console.log('✅ User flags reset to:', this.userFlags);
  }

  // Get current flags without async loading (for immediate UI updates)
  getCurrentFlags(): UserFlags {
    return { ...this.userFlags };
  }
}