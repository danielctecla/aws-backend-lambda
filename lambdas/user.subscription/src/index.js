const { getSupabase } = require('/opt/nodejs/utils/supabase');
const { customResponse } = require('/opt/nodejs/utils/response');

// Import handlers
const { GetSubscriptionService, handleGetSubscription } = require('./handlers/get-subscription');
const { DeleteSubscriptionService, handleDeleteSubscription } = require('./handlers/delete-subscription');

/**
 * Validates Supabase authorization token
 * @param {string} authToken - Supabase authorization token
 * @returns {Promise<Object>} Validated user or error
 */
async function validateSupabaseSession(authToken) {
  if (!authToken) {
    return { isValid: false, error: 'Authorization token is required' };
  }

  try {
    const supabase = getSupabase();
    const cleanToken = authToken.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(cleanToken);
    
    if (error || !user) {
      return { isValid: false, error: 'Invalid or expired session' };
    }

    return { isValid: true, user };
  } catch (error) {
    return { isValid: false, error: 'Session validation failed' };
  }
}

/**
 * Main Lambda handler - routes to appropriate method handler
 */
exports.handler = async (event) => {
  try {
    const { httpMethod, pathParameters, headers } = event;
    const authToken = headers.Authorization || headers.authorization;
    const requestedUserId = pathParameters?.userId;

    if (!requestedUserId) {
      return customResponse(400, 'User ID is required');
    }

    // Validate user session
    const authResult = await validateSupabaseSession(authToken);
    if (!authResult.isValid) {
      return customResponse(401, authResult.error);
    }

    let result;

    // Route to appropriate handler based on HTTP method
    switch (httpMethod) {
      case 'GET':
        const getService = new GetSubscriptionService();
        result = await handleGetSubscription(event, getService, authResult, requestedUserId);
        break;
        
      case 'DELETE':
        const deleteService = new DeleteSubscriptionService();
        result = await handleDeleteSubscription(event, deleteService, authResult, requestedUserId);
        break;
        
      default:
        return customResponse(405, 'Method not allowed');
    }

    return customResponse(result.statusCode, result.message, result.data);

  } catch (error) {
    console.error('Subscription endpoint error:', error);
    return customResponse(500, 'Internal server error', null);
  }
};