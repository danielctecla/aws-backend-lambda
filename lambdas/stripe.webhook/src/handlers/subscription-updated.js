/**
 * Handles subscription update events
 */
class SubscriptionUpdatedHandler {
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

  calculateNextPaymentDate(subscription) {
    if (!subscription.cancel_at_period_end && subscription.status === 'active') {
      return safeTimestampToDate(subscription.current_period_end, 'next_payment_date');
    }
    return null;
  }

  async handle(subscription, customerId, event) {
    try {
      const previousAttributes = event.data.previous_attributes || {};
      const changes = Object.keys(previousAttributes);
      
      // LOGGING CRÍTICO: Ver los valores raw que llegan de Stripe
      await this.logEvent('DEBUG', 'subscription_handler_update', 'Raw subscription data from Stripe', {
        subscription_id: subscription.id,
        customer_id: customerId,
        status: subscription.status,
        current_period_start_raw: subscription.current_period_start,
        current_period_end_raw: subscription.current_period_end,
        current_period_start_type: typeof subscription.current_period_start,
        current_period_end_type: typeof subscription.current_period_end,
        changes: changes
      });
      
      await this.logEvent('INFO', 'subscription_handler', 'Processing subscription updated', {
        subscription_id: subscription.id,
        customer_id: customerId,
        changes: changes,
        current_status: subscription.status
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

      // CONVERSIÓN SEGURA DE FECHAS
      const startDate = safeTimestampToDate(subscription.current_period_start, 'start_date');
      const endDate = safeTimestampToDate(subscription.current_period_end, 'end_date');
      const nextPaymentDate = this.calculateNextPaymentDate(subscription);

      // LOGGING CRÍTICO: Ver las fechas convertidas
      await this.logEvent('DEBUG', 'subscription_handler_update', 'Converted dates', {
        subscription_id: subscription.id,
        start_date_converted: startDate?.toISOString() || 'NULL',
        end_date_converted: endDate?.toISOString() || 'NULL',
        next_payment_date_converted: nextPaymentDate?.toISOString() || 'NULL'
      });

      // Preparar datos base para actualización
      const updateData = {
        stripe_subscription_id: subscription.id,
        is_active: subscription.status === 'active',
        cancel_at_period_end: subscription.cancel_at_period_end || false,
        modified_at: new Date()
      };

      // SIEMPRE actualizar las fechas si la suscripción está activa o si cambiaron los períodos
      if (subscription.status === 'active' || 
          changes.includes('current_period_start') || 
          changes.includes('current_period_end') ||
          changes.includes('status')) {
        
        updateData.start_date = startDate;
        updateData.end_date = endDate;
        updateData.next_payment_date = nextPaymentDate;
        
        await this.logEvent('INFO', 'subscription_handler', 'Updating subscription dates', {
          subscription_id: subscription.id,
          start_date: startDate?.toISOString() || 'NULL',
          end_date: endDate?.toISOString() || 'NULL',
          next_payment_date: nextPaymentDate?.toISOString() || 'NULL',
          reason: 'Status active or period changed'
        });
      }

      // Solo actualizar price_id y plan_snapshot si cambiaron
      if (priceId && changes.includes('items')) {
        updateData.price_id = priceId;
        updateData.plan_snapshot = planSnapshot;
      }

      // LOGGING CRÍTICO: Ver exactamente qué se va a guardar
      await this.logEvent('DEBUG', 'subscription_handler_update', 'About to update database with', {
        subscription_id: subscription.id,
        updateData: {
          ...updateData,
          start_date: updateData.start_date?.toISOString() || 'NULL',
          end_date: updateData.end_date?.toISOString() || 'NULL',
          next_payment_date: updateData.next_payment_date?.toISOString() || 'NULL'
        }
      });

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