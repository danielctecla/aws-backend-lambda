const { getStripe } = require('/opt/nodejs/utils/stripe');
const { getSupabase } = require('/opt/nodejs/utils/supabase');

/**
 * Utility function to safely convert Unix timestamp to Date
 * @param {number|null|undefined} timestamp - Unix timestamp
 * @param {string} fieldName - Name of the field for logging
 * @returns {Date|null}
 */
function safeTimestampToDate(timestamp, fieldName) {
  if (!timestamp || timestamp === 0) {
    console.warn(`Invalid timestamp for ${fieldName}: ${timestamp}`);
    return null;
  }
  
  try {
    const date = new Date(timestamp * 1000);
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date created for ${fieldName}: ${timestamp}`);
      return null;
    }
    return date;
  } catch (error) {
    console.error(`Error converting timestamp to date for ${fieldName}:`, error);
    return null;
  }
}

/**
 * Handles subscription creation events
 */
class SubscriptionCreatedHandler {
  constructor() {
    this.stripe = getStripe();
    this.supabase = getSupabase();
    this.isProduction = process.env.ENVIRONMENT === 'prod';
  }

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

  async handle(subscription, customerId) {
    try {
      // LOGGING CRÍTICO: Ver los valores raw que llegan de Stripe
      await this.logEvent('DEBUG', 'subscription_handler', 'Raw subscription data from Stripe', {
        subscription_id: subscription.id,
        customer_id: customerId,
        status: subscription.status,
        current_period_start_raw: subscription.current_period_start,
        current_period_end_raw: subscription.current_period_end,
        current_period_start_type: typeof subscription.current_period_start,
        current_period_end_type: typeof subscription.current_period_end
      });

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
      
      // CONVERSIÓN SEGURA DE FECHAS
      const startDate = safeTimestampToDate(subscription.current_period_start, 'start_date');
      const endDate = safeTimestampToDate(subscription.current_period_end, 'end_date');
      const nextPaymentDate = safeTimestampToDate(subscription.current_period_end, 'next_payment_date');

      // LOGGING CRÍTICO: Ver las fechas convertidas
      await this.logEvent('DEBUG', 'subscription_handler', 'Converted dates', {
        subscription_id: subscription.id,
        start_date_converted: startDate?.toISOString() || 'NULL',
        end_date_converted: endDate?.toISOString() || 'NULL',
        next_payment_date_converted: nextPaymentDate?.toISOString() || 'NULL'
      });
      
      // Update existing subscription based on customer_id (customer_id is unique)
      const updateData = {
        stripe_subscription_id: subscription.id,
        price_id: priceId,
        plan_snapshot: planSnapshot,
        start_date: startDate,
        end_date: endDate,
        next_payment_date: nextPaymentDate,
        is_active: subscription.status === 'active',
        cancel_at_period_end: subscription.cancel_at_period_end || false,
        production: this.isProduction,
        modified_at: new Date()
      };

      // LOGGING CRÍTICO: Ver exactamente qué se va a guardar
      await this.logEvent('DEBUG', 'subscription_handler', 'About to update database with', {
        subscription_id: subscription.id,
        updateData: {
          ...updateData,
          start_date: updateData.start_date?.toISOString() || 'NULL',
          end_date: updateData.end_date?.toISOString() || 'NULL',
          next_payment_date: updateData.next_payment_date?.toISOString() || 'NULL'
        }
      });
      
      const { error } = await this.supabase
        .from('user_subscription')
        .update(updateData)
        .eq('customer_id', customerId);

      if (error) {
        await this.logEvent(
          'ERROR', 
          'subscription_handler', 
          'Database error creating subscription', 
          {
            subscription_id: subscription.id,
            error: error.message
          }
        );
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