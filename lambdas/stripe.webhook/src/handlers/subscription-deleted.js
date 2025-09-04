const { getSupabase } = require('/opt/nodejs/utils/supabase');

/**
 * Handles subscription deletion/cancellation events
 */
class SubscriptionDeletedHandler {
  constructor() {
    this.supabase = getSupabase();
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
      
      await this.supabase
        .from('system_logs')
        .insert({
          log_level: level,
          component: component,
          message: message,
          context: context
        });

    } catch  {
      // Logging failure should not block main process
    }
  }

  /**
   * Handles subscription deletion/cancellation
   */
  async handle(subscription, customerId) {
    try {
      await this.logEvent('INFO', 'subscription_handler', 'Processing subscription deleted', {
        subscription_id: subscription.id,
        customer_id: customerId
      });

      const { error } = await this.supabase
        .from('user_subscription')
        .update({
          is_active: false,
          cancel_at_period_end: false, // Reset the flag since cancellation is now complete
          end_date: new Date(
            subscription.canceled_at ? 
              subscription.canceled_at * 1000 : 
              Date.now()
          ),
          modified_at: new Date()
        })
        .eq('customer_id', customerId);

      if (error) {
        await this.logEvent(
          'ERROR', 
          'subscription_handler', 
          'Database error deleting subscription', 
          {
            subscription_id: subscription.id,
            error: error.message
          }
        );
        throw new Error(`Database error: ${error.message}`);
      }

      await this.logEvent('INFO', 'subscription_handler', 'Subscription deleted successfully', {
        subscription_id: subscription.id,
        customer_id: customerId
      });

      return {
        status: 'success',
        action: 'subscription_canceled',
        subscription_id: subscription.id
      };
    } catch (error) {
      await this.logEvent('ERROR', 'subscription_handler', 'Error handling subscription deleted', {
        subscription_id: subscription.id,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = { SubscriptionDeletedHandler };