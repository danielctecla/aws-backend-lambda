const { getSupabase } = require('/opt/nodejs/utils/supabase');
const { customResponse } = require('/opt/nodejs/utils/response');

/**
 * Service to handle user subscription queries from database
 */
class SubscriptionService {
  constructor() {
    this.supabase = getSupabase();
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
   * Gets user subscription from database
   * @param {string} userId - User ID from Supabase auth
   * @returns {Promise<Object>} Subscription data
   */
  async getUserSubscription(userId) {
    try {
      const { data: subscription, error } = await this.supabase
        .from('user_subscription')
        .select('price_id,start_date,end_date,next_payment_date')
        .eq('user_id', userId)
        .single();

      const { data: info_subscription, error: infoSubscriptionError } = await this.supabase
      .from('subscription__plans')
      .select('name, currency, price, interval, stripe_product_id')
      .eq('price_id', subscription.price_id)
      .single();

      if (error && error.code !== 'PGRST116') {
        throw new Error(`Database error: ${error.message}`);
      }

      if (!subscription) {
        return null;
      }

      return {
        subscription_id: info_subscription.stripe_product_id,
        subscription_name: info_subscription.name,
        price: {
          price_id: subscription.price_id,
          amount: info_subscription.price,
          currency: info_subscription.currency,
          interval: info_subscription.interval
        },
        start_date: subscription.start_date,
        end_date: subscription.end_date,
        next_payment_date: subscription.next_payment_date
      };
    } catch (error) {
      throw new Error(`Failed to retrieve subscription: ${error.message}`);
    }
  }
}

/**
 * Lambda handler for GET /subscription/{userId}
 */
exports.handler = async (event) => {
  const service = new SubscriptionService();
  
  try {
    const { pathParameters, headers } = event;
    const authToken = headers.Authorization || headers.authorization;
    const requestedUserId = pathParameters?.userId;

    if (!requestedUserId) {
      return customResponse(400, 'User ID is required');
    }

    // Validate user session
    const authResult = await service.validateSupabaseSession(authToken);
    if (!authResult.isValid) {
      return customResponse(401, authResult.error);
    }

    // Verify user can only access their own subscription
    if (requestedUserId !== authResult.user.id) {
      return customResponse(403, 'Access denied: Can only view own subscription');
    }

    const subscription = await service.getUserSubscription(requestedUserId);
    
    if (!subscription) {
      return customResponse(404, 'No subscription found for this user');
    }

    return customResponse(
      200,
      'Subscription retrieved successfully',
      subscription
    );

  } catch (error) {
    console.error('Subscription endpoint error:', error);
    return customResponse(
      500,
      'Internal server error',
      null
    );
  }
};