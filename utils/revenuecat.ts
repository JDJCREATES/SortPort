import { UserFlags, RevenueCatProduct, PurchaseInfo } from '../types';

// Note: This is a mock implementation since RevenueCat requires native code
// In a real implementation, you would need to eject from Expo and install RevenueCat SDK
export class RevenueCatManager {
  private static instance: RevenueCatManager;
  private userFlags: UserFlags = {
    isSubscribed: false,
    hasUnlockPack: false,
    isProUser: false,
  };

  static getInstance(): RevenueCatManager {
    if (!RevenueCatManager.instance) {
      RevenueCatManager.instance = new RevenueCatManager();
    }
    return RevenueCatManager.instance;
  }

  async initialize(apiKey: string): Promise<void> {
    // Mock initialization
    console.log('RevenueCat initialized with API key:', apiKey);
    
    // In real implementation:
    // await Purchases.setDebugLogsEnabled(true);
    // await Purchases.configure({ apiKey });
  }

  async getUserFlags(): Promise<UserFlags> {
    // Mock implementation - in real app, this would check actual entitlements
    return this.userFlags;
  }

  async getProducts(): Promise<RevenueCatProduct[]> {
    // Mock products
    return [
      {
        identifier: 'snapsort_pro_monthly',
        description: 'SnapSort Pro Monthly Subscription',
        title: 'SnapSort Pro',
        price: '2.99',
        priceString: '$2.99',
        currencyCode: 'USD',
      },
      {
        identifier: 'unlock_pack',
        description: 'SnapSort Unlock Pack - One-time purchase',
        title: 'Unlock Pack',
        price: '9.99',
        priceString: '$9.99',
        currencyCode: 'USD',
      },
    ];
  }

  async purchaseProduct(productIdentifier: string): Promise<PurchaseInfo> {
    // Mock purchase
    console.log('Purchasing product:', productIdentifier);
    
    // Update local flags for demo
    if (productIdentifier === 'snapsort_pro_monthly') {
      this.userFlags.isSubscribed = true;
      this.userFlags.isProUser = true;
    } else if (productIdentifier === 'unlock_pack') {
      this.userFlags.hasUnlockPack = true;
    }

    return {
      productIdentifier,
      purchaseDate: new Date().toISOString(),
      originalPurchaseDate: new Date().toISOString(),
      expirationDate: productIdentifier === 'snapsort_pro_monthly' 
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : undefined,
    };
  }

  async restorePurchases(): Promise<void> {
    // Mock restore
    console.log('Restoring purchases...');
    
    // In real implementation, this would restore actual purchases
    // For demo, we'll just log
  }

  async checkSubscriptionStatus(): Promise<boolean> {
    return this.userFlags.isSubscribed;
  }

  async hasUnlockPack(): Promise<boolean> {
    return this.userFlags.hasUnlockPack;
  }

  // Mock method to simulate purchases for demo
  mockPurchase(type: 'subscription' | 'unlock') {
    if (type === 'subscription') {
      this.userFlags.isSubscribed = true;
      this.userFlags.isProUser = true;
    } else {
      this.userFlags.hasUnlockPack = true;
    }
  }
}