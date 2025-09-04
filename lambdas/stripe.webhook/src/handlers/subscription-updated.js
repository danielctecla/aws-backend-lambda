const { getSupabase } = require('/opt/nodejs/utils/supabase');

/**
 * Handles subscription update events
 */
class SubscriptionUpdatedHandler {
  constructor() {
    this.supabase = getSupabase();
    this.isProduction = process.env.ENVIRONMENT === 'prod';
  }

  async logEvent(level, component, message, context = {}) {
    try {
      
      await this.supabase
        .from('system_logs')
        .insert({
          log_level: level,
          component: component,
          message: message,
          context: context
        });

    } catch {
      // Logging failure should not block main process
    }
  }

  async handle(subscription, customerId, event) {
    try {
      const previousAttributes = event.data.previous_attributes || {};
      const changes = Object.keys(previousAttributes);
      
      await this.logEvent('INFO', 'subscription_handler', 'Processing subscription updated', {
        subscription_id: subscription.id,
        customer_id: customerId,
        changes: changes,
        current_status: subscription.status
      });

      // Get updated price details if price changed
      // const priceId = subscription.items.data[0]?.price?.id;
      // let planSnapshot = null;
      
      // if (changes.includes('items') && priceId) {
      //   const price = await this.stripe.prices.retrieve(priceId);
      //   planSnapshot = {
      //     price_id: price.id,
      //     amount: price.unit_amount,
      //     currency: price.currency,
      //     interval: price.recurring?.interval,
      //     interval_count: price.recurring?.interval_count,
      //     product_id: price.product
      //   };
      // }

      // Preparar datos base para actualización
      const updateData = {
        stripe_subscription_id: subscription.id,
        is_active: subscription.status === 'active',
        cancel_at_period_end: subscription.cancel_at_period_end || false,
        start_date: new Date(subscription.items.data[0]?.current_period_start * 1000),
        end_date: new Date(subscription.items.data[0]?.current_period_end * 1000),
        next_payment_date: new Date(subscription.items.data[0]?.current_period_end * 1000),
        modified_at: new Date()
      };


      // Solo actualizar price_id y plan_snapshot si cambiaron
      // if (priceId && changes.includes('items')) {
      //   updateData.price_id = priceId;
      //   updateData.plan_snapshot = planSnapshot;
      // }

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
};

module.exports = { SubscriptionUpdatedHandler };