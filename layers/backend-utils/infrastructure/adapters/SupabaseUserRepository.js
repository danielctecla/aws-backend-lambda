const { ISessionValidator } = require('../../application/use-cases/auth/interfaces/ISessionValidator');
const { ISubscriptionRepository } = require('../../application/use-cases/subscription/interfaces/ISubscriptionRepository');
const { getSupabase } = require('../clients/supabase');
const { Subscription } = require('../../domain/entities/Subscription');

/**
 * Supabase implementation of session validator
 */
class SupabaseSessionValidator extends ISessionValidator {
  constructor() {
    super();
    this.supabase = getSupabase();
  }

  async validateSession(authToken) {
    if (!authToken) {
      return { isValid: false, error: 'Authorization token is required' };
    }

    try {
      const cleanToken = authToken.replace('Bearer ', '');
      const { data: { user }, error } = await this.supabase.auth.getUser(cleanToken);
      
      if (error || !user) {
        return { isValid: false, error: 'Invalid or expired session' };
      }

      return { isValid: true, user };
    } catch (error) {
      return { isValid: false, error: 'Session validation failed' };
    }
  }
}

/**
 * Supabase implementation of subscription repository
 */
class SupabaseSubscriptionRepository extends ISubscriptionRepository {
  constructor() {
    super();
    this.supabase = getSupabase();
  }

  async findByUserId(userId) {
    try {
      const { data: subscriptionData, error } = await this.supabase
        .from('user_subscription')
        .select('*')
        .eq('user_id', userId)
        .single();

      // If no record found, return null
      if (error && error.code === 'PGRST116') {
        return null;
      }

      // If other error, throw it
      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      return new Subscription(
        subscriptionData.user_id,
        subscriptionData.customer_id,
        subscriptionData.plan_snapshot,
        subscriptionData.is_active
      );
    } catch (error) {
      throw new Error(`Failed to find subscription: ${error.message}`);
    }
  }

  async create(subscription) {
    try {
      const { error } = await this.supabase
        .from('user_subscription')
        .insert({
          user_id: subscription.userId,
          customer_id: subscription.customerId,
          plan_snapshot: subscription.planSnapshot,
          is_active: subscription.isActive,
          modified_at: new Date().toISOString()
        });

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }
    } catch (error) {
      throw new Error(`Failed to create subscription: ${error.message}`);
    }
  }

  async update(subscription) {
    try {
      const { error } = await this.supabase
        .from('user_subscription')
        .update({
          customer_id: subscription.customerId,
          plan_snapshot: subscription.planSnapshot,
          is_active: subscription.isActive,
          modified_at: new Date().toISOString()
        })
        .eq('user_id', subscription.userId);

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }
    } catch (error) {
      throw new Error(`Failed to update subscription: ${error.message}`);
    }
  }
}

module.exports = { 
  SupabaseSessionValidator,
  SupabaseSubscriptionRepository
};