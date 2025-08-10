const { WebhookController } = require('/opt/nodejs/presentation/controllers/WebhookController');
const { ProcessWebhookEvent } = require('/opt/nodejs/application/use-cases/subscription/processWebhookEvent');
const { SupabaseSubscriptionRepository } = require('/opt/nodejs/infrastructure/adapters/SupabaseSubscriptionRepository');

/**
 * Lambda handler for Stripe webhooks
 */
exports.handler = async (event) => {
  try {
    console.log('Stripe webhook received:', {
      httpMethod: event.httpMethod,
      path: event.path,
      headers: event.headers ? Object.keys(event.headers) : 'no headers'
    });

    // Validate HTTP method
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          statusCode: 405,
          message: 'Method Not Allowed. Use POST.'
        })
      };
    }

    // Initialize dependencies
    const subscriptionRepository = new SupabaseSubscriptionRepository();
    const processWebhookEvent = new ProcessWebhookEvent(subscriptionRepository);
    const webhookController = new WebhookController(processWebhookEvent);

    // Process the webhook
    const result = await webhookController.handleStripeWebhook(event);

    console.log('Webhook processing completed:', {
      statusCode: result.statusCode,
      success: result.statusCode < 400
    });

    return result;

  } catch (error) {
    console.error('Lambda error processing webhook:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        statusCode: 500,
        message: 'Internal server error',
        error: process.env.ENVIRONMENT === 'dev' ? error.message : undefined
      })
    };
  }
};