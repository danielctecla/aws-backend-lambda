const { getStripe } = require('/opt/nodejs/utils/stripe');
const { getSupabase } = require('/opt/nodejs/utils/supabase');

/**
 * Handles subscription update events
 */
class SubscriptionUpdatedHandler {
  constructor() {
    this.stripe = getStripe();
    this.supabase = getSupabase();
    this.isProduction = process.env.ENVIRONMENT === 'prod';
  }

  /**
   * Logs events to system_logs table
   * @param {string} level - Log level (INFO, ERROR, WARN)
   * @param {string} component - Component name
   * @param {string} message - Log message
   * @param {Object} context - Additional context data
   * @returns {Promise<void>}
   */
  async logEvent(level, component, message, context = {}) {
    try {
      const { error } = await this.supabase
        .from('system_logs')
        .insert({
          log_level: level,
          component: component,
          message: message,
          context: context
        });

      if (error) {
        console.error('Error logging to system_logs:', error);
      }
    } catch (error) {
      console.error('Error logging to system_logs:', error);
    }
  }

  /**
   * Handles subscription updates
   */
  async handle(subscription, customerId, event) {
    try {
      // Check what changed to provide better logging
      const previousAttributes = event.data.previous_attributes || {};
      const changes = Object.keys(previousAttributes);
      
      await this.logEvent('INFO', 'subscription_handler', 'Processing subscription updated', {
        subscription_id: subscription.id,
        customer_id: customerId,
        changes: changes
      });

      // Get updated price details if price changed
      const priceId = subscription.items.data[0]?.price?.id;
      let planSnapshot = null;
      
      if (changes.includes('items') && priceId) {
        const price = await this.stripe.prices.retrieve(priceId);
        planSnapshot = {
          price_id: price.id,
          amount: price.unit_amount,
          currency: price.currency,
          interval: price.recurring?.interval,
          interval_count: price.recurring?.interval_count,
          product_id: price.product
        };
      }

      const updateData = {
        stripe_subscription_id: subscription.id,
        end_date: new Date(subscription.current_period_end * 1000),
        next_payment_date: new Date(subscription.current_period_end * 1000),
        is_active: subscription.status === 'active',
        cancel_at_period_end: subscription.cancel_at_period_end || false,
        modified_at: new Date()
      };

      // Only update price_id and plan_snapshot if they changed
      if (priceId && changes.includes('items')) {
        updateData.price_id = priceId;
        updateData.plan_snapshot = planSnapshot;
      }

      // Update subscription by customer_id (unique identifier)
      const { error } = await this.supabase
        .from('user_subscription')
        .update(updateData)
        .eq('customer_id', customerId);

      if (error) {
        await this.logEvent(
          'ERROR', 
          'subscription_handler', 
          'Database error updating subscription', 
          {
            subscription_id: subscription.id,
            error: error.message
          }
        );
        
        throw new Error(`Database error: ${error.message}`);
      }

      await this.logEvent('INFO', 'subscription_handler', 'Subscription updated successfully', {
        subscription_id: subscription.id,
        customer_id: customerId,
        status: subscription.status,
        changes: changes
      });

      return {
        status: 'success',
        action: 'subscription_updated',
        subscription_id: subscription.id,
        changes: changes
      };
    } catch (error) {
      await this.logEvent('ERROR', 'subscription_handler', 'Error handling subscription updated', {
        subscription_id: subscription.id,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = { SubscriptionUpdatedHandler };