const { ISubscriptionRepository } = require('../../application/use-cases/subscription/interfaces/ISubscriptionRepository');
const { getSupabase } = require('../clients/supabase');
const { Subscription } = require('../../domain/entities/Subscription');

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

  async findByCustomerId(customerId) {
    try {
      const { data: subscriptionData, error } = await this.supabase
        .from('user_subscription')
        .select('*')
        .eq('customer_id', customerId)
        .single();

      if (error && error.code === 'PGRST116') {
        return null;
      }

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
      throw new Error(`Failed to find subscription by customer: ${error.message}`);
    }
  }

  async create(subscription) {
    try {
      const { data, error } = await this.supabase
        .from('user_subscription')
        .insert({
          user_id: subscription.userId,
          customer_id: subscription.customerId,
          plan_snapshot: subscription.planSnapshot,
          is_active: subscription.isActive,
          modified_at: new Date().toISOString()
        })
        .select();

      if (error) {
        // Handle duplicate customer_id or user_id
        if (error.code === '23505') {
          console.log(`Subscription already exists - User: ${subscription.userId}, Customer: ${subscription.customerId}`);
          return { created: false, reason: 'already_exists' };
        }
        throw new Error(`Database error: ${error.message}`);
      }

      console.log(`Subscription created successfully for user: ${subscription.userId}`);
      return { created: true, data: data[0] };
    } catch (error) {
      console.error(`Failed to create subscription for user ${subscription.userId}:`, error);
      throw new Error(`Failed to create subscription: ${error.message}`);
    }
  }

  async createOrUpdate(subscription) {
    try {
      // Try to create first
      const createResult = await this.create(subscription);
      
      if (createResult.created) {
        return { action: 'created', data: createResult.data };
      }

      if (createResult.reason === 'already_exists') {
        // If it exists, update it
        const updateResult = await this.update(subscription);
        return { action: 'updated', data: updateResult.data };
      }

      return { action: 'failed', reason: createResult.reason };
    } catch (error) {
      console.error(`Failed to create or update subscription:`, error);
      throw error;
    }
  }

  async update(subscription) {
    try {
      const { data, error } = await this.supabase
        .from('user_subscription')
        .update({
          customer_id: subscription.customerId,
          plan_snapshot: subscription.planSnapshot,
          is_active: subscription.isActive,
          modified_at: new Date().toISOString()
        })
        .eq('user_id', subscription.userId)
        .select();

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      return { data: data?.[0] };
    } catch (error) {
      throw new Error(`Failed to update subscription: ${error.message}`);
    }
  }

  async updateByCustomerId(customerId, updates) {
    try {
      // First check if subscription exists
      const existingSubscription = await this.findByCustomerId(customerId);
      if (!existingSubscription) {
        console.log(`No subscription found for customer: ${customerId}`);
        return { updated: false, reason: 'subscription_not_found' };
      }

      const { data, error } = await this.supabase
        .from('user_subscription')
        .update({
          ...updates,
          modified_at: new Date().toISOString()
        })
        .eq('customer_id', customerId)
        .select();

      if (error) {
        // Handle specific database errors
        if (error.code === '23505') { // Unique constraint violation
          console.log(`Duplicate update attempt for customer: ${customerId}`);
          return { updated: false, reason: 'duplicate_update' };
        }
        throw new Error(`Database error: ${error.message}`);
      }

      if (!data || data.length === 0) {
        console.log(`No subscription updated for customer: ${customerId}`);
        return { updated: false, reason: 'no_rows_affected' };
      }

      console.log(`Subscription updated successfully for customer: ${customerId}`);
      return { updated: true, data: data[0] };
    } catch (error) {
      console.error(`Failed to update subscription by customer ${customerId}:`, error);
      throw new Error(`Failed to update subscription by customer: ${error.message}`);
    }
  }
}

module.exports = { 
  SupabaseSubscriptionRepository
};