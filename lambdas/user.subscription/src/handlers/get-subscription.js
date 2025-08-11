const { getSupabase } = require('/opt/nodejs/utils/supabase');
const { getStripe } = require('/opt/nodejs/utils/stripe');

/**
 * Service to handle user subscription queries from database
 */
class GetSubscriptionService {
  constructor() {
    this.supabase = getSupabase();
    this.stripe = getStripe();
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
        .select('price_id, start_date, end_date, next_payment_date, stripe_subscription_id, cancel_at_period_end')
        .eq('user_id', userId)
        .single();

      const { data: info_subscription, error: infoSubscriptionError } = await this.supabase
      .from('subscription_plans')
      .select('name, currency, price, interval, stripe_product_id')
      .eq('price_id', subscription.price_id)
      .single();

      if (error && error.code !== 'PGRST116') {
        throw new Error(`Database error: ${error.message}`);
      } else if (infoSubscriptionError && infoSubscriptionError.code !== 'PGRST116') {
        throw new Error(`Subscription info error: ${infoSubscriptionError.message}`);
      }
      

      if (!subscription) {
        return null;
      }

      return {
        subscription_id: subscription.stripe_subscription_id,
        product_id: info_subscription.stripe_product_id,
        subscription_name: info_subscription.name,
        price: {
          price_id: subscription.price_id,
          amount: info_subscription.price,
          currency: info_subscription.currency,
          interval: info_subscription.interval
        },
        start_date: subscription.start_date,
        end_date: subscription.end_date,
        next_payment_date: subscription.next_payment_date,
        cancel_at_period_end: subscription.cancel_at_period_end
      };
    } catch (error) {
      throw new Error(`Failed to retrieve subscription: ${error.message}`);
    }
  }

  /**
   * Gets payment method (card) information for a subscription
   * @param {string} stripeSubscriptionId - Stripe subscription ID
   * @returns {Promise<Object>} Payment method information
   */
  async getSubscriptionPaymentMethod(stripeSubscriptionId) {
    try {
      console.log('Getting payment method for subscription:', stripeSubscriptionId);
      
      // Get the subscription from Stripe
      const subscription = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
      console.log('Subscription default_payment_method:', subscription.default_payment_method);
      
      let paymentMethodId = subscription.default_payment_method;
      
      // If no payment method on subscription, check the customer
      if (!paymentMethodId && subscription.customer) {
        const customer = await this.stripe.customers.retrieve(subscription.customer);
        console.log('Customer default payment method:', customer.invoice_settings?.default_payment_method);
        paymentMethodId = customer.invoice_settings?.default_payment_method;
        
        // If still no payment method, get the latest invoice to find payment method
        if (!paymentMethodId) {
          const invoices = await this.stripe.invoices.list({
            subscription: stripeSubscriptionId,
            limit: 1
          });
          
          if (invoices.data.length > 0) {
            paymentMethodId = invoices.data[0].payment_intent?.payment_method;
            console.log('Payment method from latest invoice:', paymentMethodId);
          }
        }
      }
      
      if (!paymentMethodId) {
        console.log('No payment method found');
        return { error: 'No payment method found' };
      }

      // Get the payment method details
      const paymentMethod = await this.stripe.paymentMethods.retrieve(paymentMethodId);
      console.log('Payment method type:', paymentMethod.type);
      
      if (paymentMethod.type === 'card') {
        return {
          id: paymentMethod.id,
          type: paymentMethod.type,
          card: {
            brand: paymentMethod.card.brand,
            last4: paymentMethod.card.last4,
            exp_month: paymentMethod.card.exp_month,
            exp_year: paymentMethod.card.exp_year,
          }
        };
      }

      return {
        id: paymentMethod.id,
        type: paymentMethod.type
      };

    } catch (error) {
      console.error('Error retrieving payment method:', error);
      return { error: error.message };
    }
  }
}

/**
 * Handles GET /subscription/{userId}
 */
async function handleGetSubscription(event, service, authResult, requestedUserId) {
  // Verify user can only access their own subscription
  if (requestedUserId !== authResult.user.id) {
    return { statusCode: 403, message: 'Access denied: Can only view own subscription' };
  }

  const subscription = await service.getUserSubscription(requestedUserId);
  
  if (!subscription) {
    return { statusCode: 404, message: 'No subscription found for this user' };
  }

  if (subscription.stripe_subscription_id) {
    const paymentMethod = await service.getSubscriptionPaymentMethod(subscription.stripe_subscription_id);
    subscription.payment_method = paymentMethod;
  } else {
    subscription.payment_method = { error: 'No stripe subscription ID found' };
  }

  return {
    statusCode: 200,
    message: 'Subscription retrieved successfully',
    data: subscription
  };
}

module.exports = { GetSubscriptionService, handleGetSubscription };