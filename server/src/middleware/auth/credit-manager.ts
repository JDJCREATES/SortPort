import { supabaseService } from '../../lib/supabase/client';

export interface CreditOperation {
  userId: string;
  amount: number;
  operation: 'deduct' | 'add' | 'set';
  reason: string;
  metadata?: Record<string, any>;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  operation: string;
  reason: string;
  balance_before: number;
  balance_after: number;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface CreditCheckResult {
  sufficient: boolean;
  currentCredits: number;
  required: number;
  message?: string;
}

export class CreditManager {
  private readonly minimumCredits = 0;
  private readonly maxCreditsPerOperation = 1000;

  constructor() {}

  async checkCredits(userId: string, requiredCredits: number): Promise<CreditCheckResult> {
    try {
      if (requiredCredits <= 0) {
        return {
          sufficient: false,
          currentCredits: 0,
          required: requiredCredits,
          message: 'Invalid credit amount'
        };
      }

      if (requiredCredits > this.maxCreditsPerOperation) {
        return {
          sufficient: false,
          currentCredits: 0,
          required: requiredCredits,
          message: `Exceeds maximum credits per operation (${this.maxCreditsPerOperation})`
        };
      }

      const { data: profile, error } = await supabaseService
        .from('user_profiles')
        .select('credits')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Credit check error:', error);
        return {
          sufficient: false,
          currentCredits: 0,
          required: requiredCredits,
          message: 'Unable to verify credits'
        };
      }

      const currentCredits = profile?.credits || 0;
      const sufficient = currentCredits >= requiredCredits;

      return {
        sufficient,
        currentCredits,
        required: requiredCredits,
        message: sufficient ? undefined : 'Insufficient credits'
      };
    } catch (error) {
      console.error('Credit check error:', error);
      return {
        sufficient: false,
        currentCredits: 0,
        required: requiredCredits,
        message: 'Credit verification failed'
      };
    }
  }

  async deductCredits(operation: CreditOperation): Promise<boolean> {
    if (operation.operation !== 'deduct') {
      console.error('Invalid operation for deductCredits:', operation.operation);
      return false;
    }

    try {
      // Start a transaction
      const { data: profile, error: fetchError } = await supabaseService
        .from('user_profiles')
        .select('credits')
        .eq('user_id', operation.userId)
        .single();

      if (fetchError || !profile) {
        console.error('Failed to fetch user profile for credit deduction:', fetchError);
        return false;
      }

      const currentCredits = profile.credits || 0;
      
      if (currentCredits < operation.amount) {
        console.warn(`Insufficient credits for user ${operation.userId}: ${currentCredits} < ${operation.amount}`);
        return false;
      }

      const newBalance = Math.max(currentCredits - operation.amount, this.minimumCredits);

      // Update credits
      const { error: updateError } = await supabaseService
        .from('user_profiles')
        .update({ credits: newBalance })
        .eq('user_id', operation.userId);

      if (updateError) {
        console.error('Failed to update credits:', updateError);
        return false;
      }

      // Log the transaction
      await this.logTransaction({
        user_id: operation.userId,
        amount: -operation.amount,
        operation: operation.operation,
        reason: operation.reason,
        balance_before: currentCredits,
        balance_after: newBalance,
        created_at: new Date().toISOString(),
        metadata: operation.metadata
      });

      return true;
    } catch (error) {
      console.error('Credit deduction error:', error);
      return false;
    }
  }

  async addCredits(operation: CreditOperation): Promise<boolean> {
    if (operation.operation !== 'add') {
      console.error('Invalid operation for addCredits:', operation.operation);
      return false;
    }

    try {
      const { data: profile, error: fetchError } = await supabaseService
        .from('user_profiles')
        .select('credits')
        .eq('user_id', operation.userId)
        .single();

      if (fetchError || !profile) {
        console.error('Failed to fetch user profile for credit addition:', fetchError);
        return false;
      }

      const currentCredits = profile.credits || 0;
      const newBalance = currentCredits + operation.amount;

      // Update credits
      const { error: updateError } = await supabaseService
        .from('user_profiles')
        .update({ credits: newBalance })
        .eq('user_id', operation.userId);

      if (updateError) {
        console.error('Failed to update credits:', updateError);
        return false;
      }

      // Log the transaction
      await this.logTransaction({
        user_id: operation.userId,
        amount: operation.amount,
        operation: operation.operation,
        reason: operation.reason,
        balance_before: currentCredits,
        balance_after: newBalance,
        created_at: new Date().toISOString(),
        metadata: operation.metadata
      });

      return true;
    } catch (error) {
      console.error('Credit addition error:', error);
      return false;
    }
  }

  async setCredits(operation: CreditOperation): Promise<boolean> {
    if (operation.operation !== 'set') {
      console.error('Invalid operation for setCredits:', operation.operation);
      return false;
    }

    try {
      const { data: profile, error: fetchError } = await supabaseService
        .from('user_profiles')
        .select('credits')
        .eq('user_id', operation.userId)
        .single();

      if (fetchError || !profile) {
        console.error('Failed to fetch user profile for credit setting:', fetchError);
        return false;
      }

      const currentCredits = profile.credits || 0;
      const newBalance = Math.max(operation.amount, this.minimumCredits);

      // Update credits
      const { error: updateError } = await supabaseService
        .from('user_profiles')
        .update({ credits: newBalance })
        .eq('user_id', operation.userId);

      if (updateError) {
        console.error('Failed to update credits:', updateError);
        return false;
      }

      // Log the transaction
      await this.logTransaction({
        user_id: operation.userId,
        amount: newBalance - currentCredits,
        operation: operation.operation,
        reason: operation.reason,
        balance_before: currentCredits,
        balance_after: newBalance,
        created_at: new Date().toISOString(),
        metadata: operation.metadata
      });

      return true;
    } catch (error) {
      console.error('Credit setting error:', error);
      return false;
    }
  }

  async getCurrentCredits(userId: string): Promise<number | null> {
    try {
      const { data: profile, error } = await supabaseService
        .from('user_profiles')
        .select('credits')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Failed to get current credits:', error);
        return null;
      }

      return profile?.credits || 0;
    } catch (error) {
      console.error('Get current credits error:', error);
      return null;
    }
  }

  async getTransactionHistory(userId: string, limit: number = 50): Promise<CreditTransaction[]> {
    try {
      const { data: transactions, error } = await supabaseService
        .from('credit_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Failed to get transaction history:', error);
        return [];
      }

      return transactions || [];
    } catch (error) {
      console.error('Get transaction history error:', error);
      return [];
    }
  }

  private async logTransaction(transaction: Omit<CreditTransaction, 'id'>): Promise<void> {
    try {
      const { error } = await supabaseService
        .from('credit_transactions')
        .insert([transaction]);

      if (error) {
        console.error('Failed to log credit transaction:', error);
      }
    } catch (error) {
      console.error('Transaction logging error:', error);
    }
  }

  async processOperation(operation: CreditOperation): Promise<boolean> {
    switch (operation.operation) {
      case 'deduct':
        return await this.deductCredits(operation);
      case 'add':
        return await this.addCredits(operation);
      case 'set':
        return await this.setCredits(operation);
      default:
        console.error('Unknown credit operation:', operation.operation);
        return false;
    }
  }

  // Batch operations for efficiency
  async batchProcessOperations(operations: CreditOperation[]): Promise<boolean[]> {
    const results = await Promise.allSettled(
      operations.map(operation => this.processOperation(operation))
    );

    return results.map(result => 
      result.status === 'fulfilled' ? result.value : false
    );
  }

  // Credit validation helpers
  validateCreditAmount(amount: number): { valid: boolean; message?: string } {
    if (amount <= 0) {
      return { valid: false, message: 'Credit amount must be positive' };
    }

    if (amount > this.maxCreditsPerOperation) {
      return { valid: false, message: `Exceeds maximum credits per operation (${this.maxCreditsPerOperation})` };
    }

    if (!Number.isInteger(amount)) {
      return { valid: false, message: 'Credit amount must be a whole number' };
    }

    return { valid: true };
  }

  // Subscription tier credit limits
  async getCreditLimitsForTier(tier: string): Promise<{ daily: number; monthly: number }> {
    const limits = {
      free: { daily: 10, monthly: 100 },
      basic: { daily: 50, monthly: 1000 },
      premium: { daily: 200, monthly: 5000 },
      enterprise: { daily: 1000, monthly: 25000 }
    };

    return limits[tier as keyof typeof limits] || limits.free;
  }
}

// Singleton instance
export const creditManager = new CreditManager();
