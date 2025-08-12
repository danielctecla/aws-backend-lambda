const { customResponse } = require('/opt/nodejs/utils/response');
const { handleCreateCheckoutSession } = require('./handlers/create-checkout-session');
const { handleGetCheckoutSession } = require('./handlers/get-checkout-session');

exports.handler = async (event) => {
  try {
    const method = event.httpMethod;
    const path = event.pathParameters;

    let result;

    switch (method) {
      case 'POST':
        result = await handleCreateCheckoutSession(event);
        break;
      case 'GET':
        result = await handleGetCheckoutSession(event, path);
        break;
      default:
        return customResponse(
          405,
          'Method not allowed',
          null
        );
    }

    return customResponse(
      result.statusCode,
      result.message,
      result.data || null
    );

  } catch (error) {
    console.error('Checkout handler error:', error);
    
    // Handle specific error types
    if (error.message.includes('Authorization token is required') || 
        error.message.includes('Invalid or expired session')) {
      return customResponse(
        401,
        error.message,
        null
      );
    }
    
    if (error.message.includes('No such price')) {
      return customResponse(
        400,
        'Invalid price ID',
        null
      );
    }

    if (error.message.includes('No such checkout session')) {
      return customResponse(
        404,
        'Checkout session not found',
        null
      );
    }

    if (error.message.includes('Database') || error.message.includes('Stripe')) {
      return customResponse(
        500,
        'Service temporarily unavailable',
        null
      );
    }

    return customResponse(
      500,
      'Internal server error',
      null
    );
  }
};

