const { getStripe } = require('/opt/nodejs/utils/stripe');
const { getSupabase } = require('/opt/nodejs/utils/supabase');

/**
 * Handles subscription creation events
 */
class SubscriptionCreatedHandler {
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
   * Handles subscription creation
   */
  async handle(subscription, customerId) {
    try {
      await this.logEvent('INFO', 'subscription_handler', 'Processing subscription created', {
        subscription_id: subscription.id,
        customer_id: customerId
      });

      // Get customer info from Stripe
      const customer = await this.stripe.customers.retrieve(customerId);
      
      // Get price details for plan snapshot
      const priceId = subscription.items.data[0]?.price?.id;
      const price = priceId ? await this.stripe.prices.retrieve(priceId) : null;
      
      const planSnapshot = price ? {
        price_id: price.id,
        amount: price.unit_amount,
        currency: price.currency,
        interval: price.recurring?.interval,
        interval_count: price.recurring?.interval_count,
        product_id: price.product
      } : null;
      
      // Update existing subscription based on customer_id (customer_id is unique)
      const updateData = {
        stripe_subscription_id: subscription.id,
        price_id: priceId,
        plan_snapshot: planSnapshot,
        start_date: new Date(subscription.current_period_start * 1000),
        end_date: new Date(subscription.current_period_end * 1000),
        next_payment_date: new Date(subscription.current_period_end * 1000),
        is_active: subscription.status === 'active',
        cancel_at_period_end: subscription.cancel_at_period_end || false,
        production: this.isProduction,
        modified_at: new Date()
      };
      
      const { error } = await this.supabase
        .from('user_subscription')
        .update(updateData)
        .eq('customer_id', customerId);

      if (error) {
        await this.logEvent('ERROR', 'subscription_handler', 'Database error creating subscription', {
          subscription_id: subscription.id,
          error: error.message
        });
        throw new Error(`Database error: ${error.message}`);
      }

      await this.logEvent('INFO', 'subscription_handler', 'Subscription created successfully', {
        subscription_id: subscription.id,
        customer_id: customerId,
        status: subscription.status,
        has_user_id: !!customer.metadata.user_id
      });

      return {
        status: 'success',
        action: 'subscription_created',
        subscription_id: subscription.id
      };
    } catch (error) {
      await this.logEvent('ERROR', 'subscription_handler', 'Error handling subscription created', {
        subscription_id: subscription.id,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = { SubscriptionCreatedHandler };