const { getStripe } = require('/opt/nodejs/utils/stripe');
const { getSupabase } = require('/opt/nodejs/utils/supabase');

class WebhookService {
  constructor() {
    this.stripe = getStripe();
    this.supabase = getSupabase();
    this.processedEvents = new Set(); // In-memory cache for this instance
    this.isProduction = process.env.ENVIRONMENT === 'prod';
  }

  /**
   * Verifies the webhook signature from Stripe
   * @param {string} body - Raw request body
   * @param {string} signature - Stripe signature header
   * @returns {Object} Verified event object
   * @throws {Error} If signature verification fails
   */
  verifyWebhookSignature(body, signature) {
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!endpointSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET environment variable is required');
    }

    try {
      const event = this.stripe.webhooks.constructEvent(
        body,
        signature,
        endpointSecret
      );
      return event;
    } catch (error) {
      console.error('Webhook signature verification failed:', error.message);
      throw new Error(`Invalid webhook signature: ${error.message}`);
    }
  }

  /**
   * Checks if an event has already been processed to prevent duplicates
   * @param {string} eventId - Stripe event ID
   * @returns {Promise<boolean>} True if event is duplicate, false otherwise
   */
  async isDuplicateEvent(eventId) {
    // Check in-memory cache first (fast check for same Lambda instance)
    if (this.processedEvents.has(eventId)) {
      await this.logEvent('INFO', 'webhook_duplicate', 'Duplicate event detected in memory cache', { event_id: eventId });
      return true;
    }

    try {
      // Check in system_logs for persistent duplicate detection
      const { data, error } = await this.supabase
        .from('system_logs')
        .select('id')
        .eq('component', 'stripe_webhook')
        .eq('message', 'Event processed successfully')
        .contains('context', { event_id: eventId })
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        await this.logEvent('ERROR', 'webhook_duplicate_check', 'Error checking duplicate event', { event_id: eventId, error: error.message });
        throw new Error('Database error while checking for duplicates');
      }

      const isDuplicate = !!data;
      
      if (isDuplicate) {
        await this.logEvent('INFO', 'webhook_duplicate', 'Duplicate event detected in database', { event_id: eventId });
      }

      return isDuplicate;
    } catch (error) {
      await this.logEvent('ERROR', 'webhook_duplicate_check', 'Error checking duplicate event', { event_id: eventId, error: error.message });
      // In case of database error, continue processing to avoid losing events
      return false;
    }
  }

  /**
   * Records a processed event to prevent future duplicates
   * @param {Object} event - Stripe event object
   * @returns {Promise<void>}
   */
  async recordProcessedEvent(event) {
    try {
      // Add to in-memory cache
      this.processedEvents.add(event.id);

      // Record in system_logs for persistent storage
      await this.logEvent('INFO', 'stripe_webhook', 'Event processed successfully', {
        event_id: event.id,
        event_type: event.type,
        api_version: event.api_version,
        created: new Date(event.created * 1000).toISOString()
      });
    } catch (error) {
      await this.logEvent('ERROR', 'webhook_record', 'Error recording processed event', { event_id: event.id, error: error.message });
    }
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
   * Handles subscription-related webhook events
   * @param {Object} event - Stripe event object
   * @returns {Promise<Object>} Processing result
   */
  async handleSubscriptionEvent(event) {
    const subscription = event.data.object;
    const customerId = subscription.customer;
    
    console.log(`Processing ${event.type} for subscription ${subscription.id}`);

    try {
      switch (event.type) {
        case 'customer.subscription.created':
          return await this.handleSubscriptionCreated(subscription, customerId);
          
        case 'customer.subscription.updated':
          return await this.handleSubscriptionUpdated(subscription, customerId, event);
          
        case 'customer.subscription.deleted':
          return await this.handleSubscriptionDeleted(subscription, customerId);
          
        case 'invoice.payment_succeeded':
          return await this.handleInvoicePaymentSucceeded(event.data.object, customerId);
          
        case 'invoice.payment_failed':
          return await this.handleInvoicePaymentFailed(event.data.object, customerId);
          
        default:
          console.log(`Unhandled subscription event: ${event.type}`);
          return { status: 'ignored', message: `Event type ${event.type} not handled` };
      }
    } catch (error) {
      console.error(`Error handling ${event.type}:`, error);
      throw error;
    }
  }

  /**
   * Handles subscription creation
   */
  async handleSubscriptionCreated(subscription, customerId) {
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
        price_id: priceId,
        plan_snapshot: planSnapshot,
        start_date: new Date(subscription.current_period_start * 1000),
        end_date: new Date(subscription.current_period_end * 1000),
        next_payment_date: new Date(subscription.current_period_end * 1000),
        is_active: subscription.status === 'active',
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

  /**
   * Handles subscription updates
   */
  async handleSubscriptionUpdated(subscription, customerId, event) {
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
        end_date: new Date(subscription.current_period_end * 1000),
        next_payment_date: new Date(subscription.current_period_end * 1000),
        is_active: subscription.status === 'active',
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
        await this.logEvent('ERROR', 'subscription_handler', 'Database error updating subscription', {
          subscription_id: subscription.id,
          error: error.message
        });
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

  /**
   * Handles subscription deletion/cancellation
   */
  async handleSubscriptionDeleted(subscription, customerId) {
    try {
      await this.logEvent('INFO', 'subscription_handler', 'Processing subscription deleted', {
        subscription_id: subscription.id,
        customer_id: customerId
      });

      const { error } = await this.supabase
        .from('user_subscription')
        .update({
          is_active: false,
          end_date: new Date(subscription.canceled_at ? subscription.canceled_at * 1000 : Date.now()),
          modified_at: new Date()
        })
        .eq('customer_id', customerId);

      if (error) {
        await this.logEvent('ERROR', 'subscription_handler', 'Database error deleting subscription', {
          subscription_id: subscription.id,
          error: error.message
        });
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

  /**
   * Handles successful invoice payments
   */
  async handleInvoicePaymentSucceeded(invoice, customerId) {
    try {
      await this.logEvent('INFO', 'payment_handler', 'Processing payment succeeded', {
        invoice_id: invoice.id,
        customer_id: customerId,
        amount: invoice.amount_paid
      });

      // Update payment status - set subscription as active and update next payment date
      const { error } = await this.supabase
        .from('user_subscription')
        .update({
          is_active: true,
          next_payment_date: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
          modified_at: new Date()
        })
        .eq('customer_id', customerId);

      if (error) {
        await this.logEvent('ERROR', 'payment_handler', 'Database error updating payment success', {
          invoice_id: invoice.id,
          error: error.message
        });
        throw new Error(`Database error: ${error.message}`);
      }

      await this.logEvent('INFO', 'payment_handler', 'Payment succeeded processed successfully', {
        invoice_id: invoice.id,
        customer_id: customerId,
        amount: invoice.amount_paid
      });

      return {
        status: 'success',
        action: 'payment_succeeded',
        invoice_id: invoice.id,
        amount: invoice.amount_paid
      };
    } catch (error) {
      await this.logEvent('ERROR', 'payment_handler', 'Error handling payment succeeded', {
        invoice_id: invoice.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handles failed invoice payments
   */
  async handleInvoicePaymentFailed(invoice, customerId) {
    try {
      await this.logEvent('WARN', 'payment_handler', 'Processing payment failed', {
        invoice_id: invoice.id,
        customer_id: customerId,
        attempt_count: invoice.attempt_count
      });

      // For now, we don't deactivate subscription on first payment failure
      // Stripe will retry automatically, so we just log the failure
      await this.logEvent('WARN', 'payment_handler', 'Payment failed - subscription remains active', {
        invoice_id: invoice.id,
        customer_id: customerId,
        attempt_count: invoice.attempt_count,
        next_payment_attempt: invoice.next_payment_attempt
      });

      return {
        status: 'success',
        action: 'payment_failed',
        invoice_id: invoice.id,
        attempt_count: invoice.attempt_count
      };
    } catch (error) {
      await this.logEvent('ERROR', 'payment_handler', 'Error handling payment failed', {
        invoice_id: invoice.id,
        error: error.message
      });
      throw error;
    }
  }


  /**
   * Validates webhook event for processing
   * @param {Object} event - Stripe event object
   * @returns {Object} Validation result
   */
  validateWebhookEvent(event) {
    const errors = [];

    if (!event.id) {
      errors.push('Event ID is missing');
    }

    if (!event.type) {
      errors.push('Event type is missing');
    }

    if (!event.data || !event.data.object) {
      errors.push('Event data is missing or invalid');
    }

    // Check if event is too old (older than 24 hours)
    const eventAge = Date.now() - (event.created * 1000);
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
    if (eventAge > maxAge) {
      errors.push('Event is too old to process');
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Determines if an event type should be processed
   * @param {string} eventType - Stripe event type
   * @returns {boolean} True if event should be processed
   */
  isRelevantEvent(eventType) {
    const relevantEvents = [
      'customer.subscription.created',
      'customer.subscription.updated', 
      'customer.subscription.deleted',
      'invoice.payment_succeeded',
      'invoice.payment_failed'
    ];

    return relevantEvents.includes(eventType);
  }
}

module.exports = { WebhookService };