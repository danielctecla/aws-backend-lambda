const { getStripe } = require('/opt/nodejs/utils/stripe');
const { getSupabase } = require('/opt/nodejs/utils/supabase');

/**
 * Service to handle checkout session retrieval
 */
class GetCheckoutSessionService {
  constructor() {
    this.stripe = getStripe();
    this.supabase = getSupabase();
    this.isProduction = process.env.ENVIRONMENT === 'prod';
  }

  /**
   * Validates Supabase authorization token
   * @param {string} authToken - Supabase authorization token
   * @returns {Promise<Object>} Validated user or error
   */
  async validateSupabaseSession(authToken) {
    if (!authToken) {
      return { isValid: false, error: 'Authorization token is required' };
    }

    try {
      const cleanToken = authToken.replace('Bearer ', '');
      const { data: { user }, error } = await this.supabase.auth.getUser(cleanToken);
      
      if (error || !user) {
        return { isValid: false, error: 'Invalid or expired session' };
      }

      return { isValid: true, user };
    } catch (error) {
      return { isValid: false, error: 'Session validation failed' };
    }
  }

  /**
   * Gets checkout session information
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Session information
   */
  async getCheckoutSession(sessionId) {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      
      console.log('Retrieved checkout session:', session);

      return {
        id: session.id,
        status: session.status,
        payment_status: session.payment_status,
        customer_email: session.customer_details?.email,
        url: session.url
      };
    } catch (error) {
      throw new Error(`Failed to retrieve checkout session: ${error.message}`);
    }
  }
}

/**
 * Handles GET /checkout/{session_id} - Get checkout session information
 */
async function handleGetCheckoutSession(event, pathParameters) {
  const service = new GetCheckoutSessionService();

  // Get authorization token
  const authToken = event.headers?.Authorization || event.headers?.authorization;
  
  if (!authToken) {
    return {
      statusCode: 401,
      message: 'Authorization token is required'
    };
  }

  // Validate user session
  const authResult = await service.validateSupabaseSession(authToken);
  if (!authResult.isValid) {
    return {
      statusCode: 401,
      message: authResult.error
    };
  }

  const sessionId = pathParameters?.session_id;

  if (!sessionId) {
    return {
      statusCode: 400,
      message: 'Session ID is required'
    };
  }

  const session = await service.getCheckoutSession(sessionId);

  return {
    statusCode: 200,
    message: 'Checkout session retrieved successfully',
    data: session
  };
}

module.exports = { GetCheckoutSessionService, handleGetCheckoutSession };