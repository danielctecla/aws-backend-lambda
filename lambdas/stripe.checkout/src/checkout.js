const { getStripe } = require('/opt/nodejs/utils/stripe');
const { getSupabase } = require('/opt/nodejs/utils/supabase');

/**
 * Service to handle checkout operations
 */
class CheckoutService {
  constructor() {
    this.stripe = getStripe();
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
   * Handles user and customer logic according to the new flow
   * @param {Object} user - Supabase user
   * @param {string} priceId - Price ID for plan snapshot
   * @returns {Promise<Object>} Customer ID and information
   */
  async handleUserSubscription(user, priceId) {
    let createdCustomer = null;

    try {
      // Search for user in user_subscription
      const { data: existingUser, error: searchError } = await this.supabase
        .from('user_subscription')
        .select('*')
        .eq('user_id', user.id)
        .single();

      // If no "not found" error, it's a real error
      if (searchError && searchError.code !== 'PGRST116') {
        throw new Error(`Database error: ${searchError.message}`);
      }

      // Get plan snapshot
      const planSnapshot = await this.getPlanSnapshot(priceId);

      // CASE 1: User exists and has customer_id
      if (existingUser && existingUser.customer_id) {
        return {
          customerId: existingUser.customer_id,
          action: 'existing',
          rollback: async () => {}
        };
      }

      // Create customer in Stripe
      createdCustomer = await this.stripe.customers.create({
        email: user.email,
        name: user.user_metadata.full_name || user.email,
        metadata: { supabase_user_id: user.id }
      });

      // CASE 2: User exists but doesn't have customer_id
      if (existingUser && !existingUser.customer_id) {
        const { error: updateError } = await this.supabase
          .from('user_subscription')
          .update({ 
            customer_id: createdCustomer.id,
            plan_snapshot: planSnapshot,
            modified_at: new Date().toISOString()
          })
          .eq('user_id', user.id);

        if (updateError) {
          throw new Error(`Failed to update customer_id: ${updateError.message}`);
        }

        return {
          customerId: createdCustomer.id,
          action: 'updated',
          rollback: async () => {
            await this.stripe.customers.del(createdCustomer.id);
            await this.supabase
              .from('user_subscription')
              .update({ customer_id: null, plan_snapshot: null, modified_at: new Date().toISOString()})
              .eq('user_id', user.id);
          }
        };
      }

      // CASE 3: User doesn't exist - create complete record
      await this.supabase
        .from('user_subscription')
        .insert({
          user_id: user.id,
          customer_id: createdCustomer.id,
          plan_snapshot: planSnapshot,
          is_active: false,
          modified_at: new Date().toISOString()
        });

      return {
        customerId: createdCustomer.id,
        action: 'created',
        rollback: async () => {
          await this.supabase
            .from('user_subscription')
            .delete()
            .eq('user_id', user.id);
          await this.stripe.customers.del(createdCustomer.id);
        }
      };

    } catch (error) {
      if (createdCustomer) {
        try {
          await this.stripe.customers.del(createdCustomer.id);
        } catch (rollbackError) {
          console.error('Auto-rollback error:', rollbackError);
        }
      }
      throw error;
    }
  }

  /**
   * Gets subscription plan information
   * @param {string} priceId - Stripe price ID
   * @returns {Promise<Object>} Plan information
   */
  async getPlanSnapshot(priceId) {
    try {
      
      // todo: Anon key cannot access subscription_plans table directly
      // // Try to get from DB first
      // const { data: plan } = await this.supabase
      //   .from('subscription_plans')
      //   .select('*')
      //   .eq('price_id', priceId)
      //   .single();

      // if (plan) return plan;

      // Fallback to Stripe

      const price = await this.stripe.prices.retrieve(priceId, { expand: ['product'] });
      return {
        price_id: price.id,
        product_name: price.product.name,
        amount: price.unit_amount,
        currency: price.currency,
        interval: price.recurring?.interval,
        interval_count: price.recurring?.interval_count,
        metadata: price.product.metadata
      };
    } catch (error) {
      throw new Error(`Failed to retrieve plan information: ${error.message}`);
    }
  }

  /**
   * Validates input data for creating a checkout session
   * @param {Object} data - Session data
   * @returns {Object} Validated data or errors
   */
  validateCheckoutData(data) {
    const errors = [];
    
    if (!data.price_id) {
      errors.push('price_id is required');
    }
    
    if (!data.success_url) {
      errors.push('success_url is required');
    }
    
    if (!data.cancel_url) {
      errors.push('cancel_url is required');
    }

    return {
      isValid: errors.length === 0,
      errors,
      data: {
        price_id: data.price_id,
        success_url: data.success_url,
        cancel_url: data.cancel_url,
        quantity: data.quantity || 1
      }
    };
  }

  /**
   * Validates email format
   * @param {string} email - Email to validate
   * @returns {boolean} True if valid
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Checks if an active checkout session exists for customer and price_id
   * @param {string} customerId - Stripe customer ID
   * @param {string} priceId - Price ID
   * @returns {Promise<Object|null>} Active session or null
   */
  async checkExistingCheckoutSession(customerId, priceId) {
    try {
      // Search for active customer sessions
      const sessions = await this.stripe.checkout.sessions.list({
        customer: customerId,
        limit: 10
      });

      // Filter by open sessions with same price_id
      const activeSessions = sessions.data.filter(session => {
        if (session.status !== 'open') return false;
        
        // Check if any line_item has the same price_id
        return session.line_items?.data?.some(item => item.price?.id === priceId) ||
               session.metadata?.price_id === priceId;
      });

      return activeSessions.length > 0 ? activeSessions[0] : null;
    } catch (error) {
      console.error('Error checking existing sessions:', error);
      return null; // In case of error, allow creating new session
    }
  }

  /**
   * Creates a Stripe checkout session
   * @param {Object} checkoutData - Validated checkout data
   * @param {string} customerId - Stripe customer ID
   * @param {boolean} checkExisting - Whether to check existing sessions
   * @returns {Promise<Object>} Created or existing checkout session
   */
  async createCheckoutSession(checkoutData, customerId, checkExisting = false) {
    try {
      // Only check existing sessions if checkExisting is true
      if (checkExisting) {
        const existingSession = await this.checkExistingCheckoutSession(customerId, checkoutData.price_id);
        
        if (existingSession) {
          return {
            session: {
              id: existingSession.id,
              url: existingSession.url,
              status: existingSession.status,
              payment_status: existingSession.payment_status
            },
            rollback: async () => {} // No rollback for existing session
          };
        }
      }

      // Create new session
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: checkoutData.price_id, quantity: checkoutData.quantity }],
        mode: 'subscription',
        success_url: checkoutData.success_url,
        cancel_url: checkoutData.cancel_url,
        customer: customerId,
        metadata: {
          ...checkoutData.metadata,
          price_id: checkoutData.price_id // Add price_id to metadata for future searches
        }
      });
      
      return {
        session: {
          id: session.id,
          url: session.url,
          status: session.status,
          payment_status: session.payment_status
        },
        rollback: async () => {
          if (session.status === 'open') {
            await this.stripe.checkout.sessions.expire(session.id);
          }
        }
      };
    } catch (error) {
      throw new Error(`Failed to create checkout session: ${error.message}`);
    }
  }

  /**
   * Processes complete checkout with the new simplified flow
   * @param {Object} checkoutData - Checkout data
   * @param {string} authToken - Supabase authorization token
   * @returns {Promise<Object>} Checkout result
   */
  async processCheckout(checkoutData, authToken) {
    let userSubscriptionData = null;
    let sessionData = null;

    try {
      // 1. Validate user
      const authResult = await this.validateSupabaseSession(authToken);
      if (!authResult.isValid) {
        throw new Error(authResult.error);
      }

      // 2. Handle user and customer according to new flow
      userSubscriptionData = await this.handleUserSubscription(authResult.user, checkoutData.price_id);

      // 3. Create checkout session (only check existing sessions if user already existed)
      const shouldCheckExisting = userSubscriptionData.action === 'existing';
      sessionData = await this.createCheckoutSession({
        ...checkoutData,
        metadata: {
          user_id: authResult.user.id
        }
      }, userSubscriptionData.customerId, shouldCheckExisting);

      return {
        success: true,
        session: sessionData.session,
        customer_id: userSubscriptionData.customerId,
        action: userSubscriptionData.action
      };

    } catch (error) {
      // Rollback in case of error
      if (sessionData?.rollback) {
        await sessionData.rollback();
      }
      
      if (userSubscriptionData?.rollback) {
        await userSubscriptionData.rollback();
      }

      throw error;
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
      
      return {
        id: session.id,
        status: session.status,
        payment_status: session.payment_status,
        customer_email: session.customer_email,
        url: session.url
      };
    } catch (error) {
      throw new Error(`Failed to retrieve checkout session: ${error.message}`);
    }
  }
}

module.exports = { CheckoutService };