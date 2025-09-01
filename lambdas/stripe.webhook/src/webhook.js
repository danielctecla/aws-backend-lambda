const { getStripe } = require('/opt/nodejs/utils/stripe');
const { getSupabase } = require('/opt/nodejs/utils/supabase');

// Import handlers
const { SubscriptionCreatedHandler } = require('./handlers/subscription-created');
const { SubscriptionUpdatedHandler } = require('./handlers/subscription-updated');
const { SubscriptionDeletedHandler } = require('./handlers/subscription-deleted');
const { InvoicePaymentSucceededHandler } = require('./handlers/invoice-payment-succeeded');
const { InvoicePaymentFailedHandler } = require('./handlers/invoice-payment-failed');

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
        created: new Date(event.created * 1000).toISOString(),
        raw_event: JSON.stringify(event)
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
          const createdHandler = new SubscriptionCreatedHandler();
          return await createdHandler.handle(subscription, customerId);
          
        case 'customer.subscription.updated':
          const updatedHandler = new SubscriptionUpdatedHandler();
          return await updatedHandler.handle(subscription, customerId, event);
          
        case 'customer.subscription.deleted':
          const deletedHandler = new SubscriptionDeletedHandler();
          return await deletedHandler.handle(subscription, customerId);
          
        case 'invoice.payment_succeeded':
          const paymentSucceededHandler = new InvoicePaymentSucceededHandler();
          return await paymentSucceededHandler.handle(event.data.object, customerId);
          
        case 'invoice.payment_failed':
          const paymentFailedHandler = new InvoicePaymentFailedHandler();
          return await paymentFailedHandler.handle(event.data.object, customerId);
          
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