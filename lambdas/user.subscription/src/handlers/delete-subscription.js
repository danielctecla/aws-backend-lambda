const { getSupabase } = require('/opt/nodejs/utils/supabase');
const { getStripe } = require('/opt/nodejs/utils/stripe');

/**
 * Service to handle subscription cancellation
 */
class DeleteSubscriptionService {
  constructor() {
    this.supabase = getSupabase();
    this.stripe = getStripe();
  }

  /**
   * Cancels user subscription in Stripe and updates database
   * @param {string} userId - User ID from Supabase auth
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelUserSubscription(userId) {
    try {
      console.log('Canceling subscription for user:', userId);
      
      // Get user subscription from database
      const { data: subscription, error } = await this.supabase
        .from('user_subscription')
        .select('stripe_subscription_id, customer_id, is_active')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new Error(`Database error: ${error.message}`);
      }

      if (!subscription) {
        return { error: 'No subscription found for this user' };
      }

      if (!subscription.is_active) {
        return { error: 'Subscription is already inactive' };
      }

      if (!subscription.stripe_subscription_id) {
        return { error: 'No Stripe subscription ID found' };
      }

      // Cancel subscription at period end in Stripe
      const updatedSubscription = await this.stripe.subscriptions.update(subscription.stripe_subscription_id, {
        cancel_at_period_end: true
      });
      console.log('Stripe subscription set to cancel at period end:', updatedSubscription.id);

      // Update database - mark as pending cancellation but keep active until period ends
      const { error: updateError } = await this.supabase
        .from('user_subscription')
        .update({
          cancel_at_period_end: true,
          // Keep is_active: true until the period actually ends
          modified_at: new Date()
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('Error updating database after cancellation:', updateError);
        // Note: Subscription is already updated in Stripe, so we log but don't throw
      }

      return {
        success: true,
        message: 'Subscription will be canceled at the end of the billing period',
        cancel_at_period_end: true,
        current_period_end: new Date(updatedSubscription.current_period_end * 1000),
        subscription_id: updatedSubscription.id
      };

    } catch (error) {
      console.error('Error canceling subscription:', error);
      return { error: error.message };
    }
  }
}

/**
 * Handles DELETE /subscription/{userId}
 */
async function handleDeleteSubscription(event, service, authResult, requestedUserId) {
  // Verify user can only cancel their own subscription
  if (requestedUserId !== authResult.user.id) {
    return { statusCode: 403, message: 'Access denied: Can only cancel own subscription' };
  }

  // Cancel the subscription
  const result = await service.cancelUserSubscription(requestedUserId);
  
  if (result.error) {
    return { statusCode: 400, message: result.error };
  }

  return {
    statusCode: 200,
    message: result.message,
    data: {
      canceled_at: result.canceled_at,
      subscription_id: result.subscription_id
    }
  };
}

module.exports = { DeleteSubscriptionService, handleDeleteSubscription };