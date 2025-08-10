const stripe = require('../../infrastructure/clients/stripe');
const { customResponse } = require('../response');

class WebhookController {
  constructor(processWebhookEvent) {
    this.processWebhookEvent = processWebhookEvent;
    this.endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  }

  async handleStripeWebhook(event) {
    try {
      const sig = event.headers['stripe-signature'];
      
      if (!this.endpointSecret) {
        console.error('STRIPE_WEBHOOK_SECRET not configured');
        return customResponse(500, 'Webhook not properly configured');
      }

      let stripeEvent;

      try {
        stripeEvent = stripe.webhooks.constructEvent(event.body, sig, this.endpointSecret);
      } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return customResponse(400, 'Invalid signature');
      }

      console.log(`Received webhook: ${stripeEvent.type} - ID: ${stripeEvent.id}`);

      const result = await this.processWebhookEvent.execute(stripeEvent);

      // Handle different result types
      if (result.success === false) {
        console.error(`Webhook processing failed: ${stripeEvent.type} - ${result.message}`);
        return customResponse(400, result.message, { 
          eventType: stripeEvent.type,
          eventId: stripeEvent.id 
        });
      }

      if (result.requiresManualReview) {
        console.warn(`Webhook requires manual review: ${stripeEvent.type} - ${result.message}`);
        return customResponse(200, result.message, {
          ...result,
          eventType: stripeEvent.type,
          eventId: stripeEvent.id,
          warning: 'Manual review required'
        });
      }

      console.log(`Webhook processed successfully: ${stripeEvent.type}`);
      return customResponse(200, 'Webhook processed', {
        ...result,
        eventType: stripeEvent.type,
        eventId: stripeEvent.id
      });
      
    } catch (error) {
      console.error('Webhook processing error:', error);
      return customResponse(500, 'Processing error', { 
        error: error.message 
      });
    }
  }
}

module.exports = { WebhookController };