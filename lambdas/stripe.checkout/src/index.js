const { CheckoutService } = require('./checkout');
const { customResponse } = require('/opt/nodejs/utils/response');

const checkoutService = new CheckoutService();

exports.handler = async (event) => {
  try {
    const method = event.httpMethod;
    const path = event.pathParameters;

    switch (method) {
      case 'POST':
        return await handleCreateCheckoutSession(event);
      case 'GET':
        return await handleGetCheckoutSession(path);
      default:
        return customResponse(
          405,
          'Method not allowed',
          null
        );
    }
  } catch (error) {
    console.error('Checkout handler error:', error);
    return customResponse(
      500,
      'Internal server error',
      null
    );
  }
};

/**
 * Handles the creation of a new checkout session
 * @param {Object} event - Lambda event
 * @returns {Object} HTTP response
 */
async function handleCreateCheckoutSession(event) {
  try {
    // Get authorization token
    const authToken = event.headers?.Authorization || event.headers?.authorization;
    
    if (!authToken) {
      return customResponse(
        401,
        'Authorization token is required',
        null
      );
    }

    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');

    // Validate input data
    const validation = checkoutService.validateCheckoutData(requestBody);
    
    if (!validation.isValid) {
      return customResponse(
        400,
        'Validation errors',
        { errors: validation.errors }
      );
    }

    // Process complete checkout with authentication and transaction handling
    const result = await checkoutService.processCheckout(validation.data, authToken);

    return customResponse(
      201,
      'Checkout session created successfully',
      {
        session_id: result.session.id,
        checkout_url: result.session.url,
        status: result.session.status,
        customer_id: result.customer_id,
        action: result.action
      }
    );

  } catch (error) {
    console.error('Error creating checkout session:', error);
    
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

    if (error.message.includes('Database') || error.message.includes('Stripe')) {
      return customResponse(
        500,
        'Service temporarily unavailable',
        null
      );
    }

    return customResponse(
      500,
      'Failed to create checkout session',
      null
    );
  }
}

/**
 * Handles getting checkout session information
 * @param {Object} pathParameters - URL parameters
 * @returns {Object} HTTP response
 */
async function handleGetCheckoutSession(pathParameters) {
  try {
    const sessionId = pathParameters?.session_id;

    if (!sessionId) {
      return customResponse(
        400,
        'Session ID is required',
        null
      );
    }

    const session = await checkoutService.getCheckoutSession(sessionId);

    return customResponse(
      200,
      'Checkout session retrieved successfully',
      session
    );

  } catch (error) {
    console.error('Error retrieving checkout session:', error);
    
    if (error.message.includes('No such checkout session')) {
      return customResponse(
        404,
        'Checkout session not found',
        null
      );
    }

    return customResponse(
      500,
      'Failed to retrieve checkout session',
      null
    );
  }
}