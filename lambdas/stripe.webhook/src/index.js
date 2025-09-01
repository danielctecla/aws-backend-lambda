const { WebhookService } = require('./webhook');
const { customResponse } = require('/opt/nodejs/utils/response');

const webhookService = new WebhookService();

exports.handler = async (event) => {
  try {
    // Only accept POST requests
    if (event.httpMethod !== 'POST') {
      return customResponse(
        405,
        'Method not allowed',
        { error: 'Only POST requests are accepted' }
      );
    }

    // Get raw body and Stripe signature
    const body = event.body;
    const signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];

    if (!signature) {
      console.error('Missing Stripe signature header');
      return customResponse(
        400,
        'Bad request',
        { error: 'Missing stripe-signature header' }
      );
    }

    if (!body) {
      console.error('Missing request body');
      return customResponse(
        400,
        'Bad request',
        { error: 'Missing request body' }
      );
    }

    // Verify webhook signature
    let stripeEvent;
    try {
      stripeEvent = webhookService.verifyWebhookSignature(body, signature);
    } catch (error) {
      console.error('Webhook signature verification failed:', error.message);
      return customResponse(
        400,
        'Invalid signature',
        { error: 'Webhook signature verification failed' }
      );
    }

    console.log(`Received webhook event: ${stripeEvent.type} (${stripeEvent.id})`);

    // Validate event structure
    const validation = webhookService.validateWebhookEvent(stripeEvent);
    if (!validation.isValid) {
      console.error('Invalid webhook event:', validation.errors);
      return customResponse(
        400,
        'Invalid event',
        { errors: validation.errors }
      );
    }

    // Check if this is a relevant event type
    if (!webhookService.isRelevantEvent(stripeEvent.type)) {
      console.log(`Ignoring irrelevant event type: ${stripeEvent.type}`);
      return customResponse(
        200,
        'Event ignored',
        { 
          message: `Event type ${stripeEvent.type} is not processed`,
          event_id: stripeEvent.id 
        }
      );
    }

    // Check for duplicate events
    const isDuplicate = await webhookService.isDuplicateEvent(stripeEvent.id);
    if (isDuplicate) {
      console.log(`Duplicate event ignored: ${stripeEvent.id}`);
      return customResponse(
        200,
        'Event already processed',
        { 
          message: 'Event was already processed',
          event_id: stripeEvent.id 
        }
      );
    }

    // Process the webhook event
    let result;
    try {
      console.log(`About to process subscription event: ${stripeEvent.type} (${stripeEvent.id})`);
      
      // Safely log event data avoiding circular references
      try {
        const eventData = {
          id: stripeEvent.data.object.id,
          status: stripeEvent.data.object.status,
          customer: stripeEvent.data.object.customer,
          items: stripeEvent.data.object.items?.data?.map(item => ({
            id: item.id,
            price_id: item.price?.id,
            quantity: item.quantity
          }))
        };
        console.log('Event data object:', JSON.stringify(eventData, null, 2));
      } catch (logError) {
        console.log('Event data object: [Complex object - unable to stringify safely]');
      }
      
      result = await webhookService.handleSubscriptionEvent(stripeEvent);
      
      // Record successful processing
      await webhookService.recordProcessedEvent(stripeEvent);
      
      console.log(`Successfully processed event ${stripeEvent.id}:`, result);
      
    } catch (processingError) {
      console.error(`Error processing event ${stripeEvent.id}:`, processingError);
      
      // For critical errors, we might want to return a 500 so Stripe retries
      // For non-critical errors, return 200 to acknowledge receipt
      const isCriticalError = processingError.message.includes('Database error') ||
                             processingError.message.includes('Service temporarily unavailable');
      
      if (isCriticalError) {
        return customResponse(
          500,
          'Processing failed',
          { 
            error: 'Event processing failed, will be retried',
            event_id: stripeEvent.id 
          }
        );
      } else {
        // Record the event even if processing failed to avoid infinite retries
        await webhookService.recordProcessedEvent(stripeEvent);
        
        return customResponse(
          200,
          'Event acknowledged',
          { 
            error: 'Event processing failed but acknowledged',
            event_id: stripeEvent.id,
            details: processingError.message
          }
        );
      }
    }

    // Return success response
    return customResponse(
      200,
      'Webhook processed successfully',
      {
        event_id: stripeEvent.id,
        event_type: stripeEvent.type,
        result: result
      }
    );

  } catch (error) {
    console.error('Unexpected webhook handler error:', error);
    
    // Return 500 for unexpected errors to trigger Stripe retry
    return customResponse(
      500,
      'Internal server error',
      { 
        error: 'Unexpected error occurred',
        message: error.message
      }
    );
  }
};