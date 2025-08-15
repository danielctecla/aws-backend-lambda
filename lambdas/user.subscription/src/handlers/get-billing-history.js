const { getSupabase } = require('/opt/nodejs/utils/supabase');
const { getStripe } = require('/opt/nodejs/utils/stripe');

/**
 * Service to handle billing history queries
 */
class GetBillingHistoryService {
  constructor() {
    this.supabase = getSupabase();
    this.stripe = getStripe();
    this.isProduction = process.env.ENVIRONMENT === 'prod';
  }

  /**
   * Gets customer ID from user ID
   * @param {string} userId - User ID from Supabase auth
   * @returns {Promise<string>} Customer ID
   */
  async getCustomerIdFromUserId(userId) {
    const { data: subscription, error } = await this.supabase
      .from('user_subscription')
      .select('customer_id')
      .eq('user_id', userId)
      .eq('production', this.isProduction)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!subscription?.customer_id) {
      throw new Error('No customer found for this user');
    }

    return subscription.customer_id;
  }

  /**
   * Translates plan description to Spanish
   * @param {string} description - Original description from Stripe
   * @returns {string} Spanish description
   */
  translatePlanDescription(description) {
    if (!description) {
      return 'PractiPuma Pro';
    }

    // Remove quantity and price info, keep only plan name
    let planName = description.replace(/^\d+\s*×\s*/, ''); // Remove "1 × "
    planName = planName.replace(/\s*\(at\s*\$[\d.,]+\s*\/\s*\w+\)/, '');
    
    // Clean up common English words
    planName = planName.replace(/\s*\/\s*(month|year|week|day)/, '');
    planName = planName.replace(/\s*per\s*(month|year|week|day)/, '');
    
    // Return cleaned plan name
    return planName.trim() || 'PractiPuma Pro';
  }

  /**
   * Gets billing history from Stripe
   * @param {string} customerId - Stripe customer ID
   * @returns {Promise<Array>} Billing history
   */
  async getBillingHistory(customerId) {
    try {
      console.log('Getting billing history for customer:', customerId);
      
      // Get invoices that are paid or processing (not open)
      const invoices = await this.stripe.invoices.list({
        customer: customerId,
        status: 'paid',
        limit: 100
      });

      if (!invoices.data || invoices.data.length === 0) {
        console.log('No billing history found for customer:', customerId);
        return [];
      }
    
      const billingHistory = invoices.data.map(invoice => ({
        invoice_id: invoice.id,
        plan_name: this.translatePlanDescription(invoice.lines.data[0]?.description),
        amount_paid: invoice.total / 100,
        currency: invoice.currency,
        period_start: new Date(invoice.period_start * 1000),
        period_end: new Date(invoice.period_end * 1000),
        status: invoice.status === 'paid' ? 'Pagado' : 'Procesando',
        paid_at: invoice.status_transitions?.paid_at ? 
          new Date(invoice.status_transitions.paid_at * 1000) : 
          null,
      }));

      return billingHistory;

    } catch (error) {
      console.error('Error retrieving billing history:', error);
      throw new Error(`Failed to retrieve billing history: ${error.message}`);
    }
  }

  /**
   * Gets complete billing history for a user
   * @param {string} userId - User ID from Supabase auth
   * @returns {Promise<Array>} Complete billing history
   */
  async getUserBillingHistory(userId) {
    try {
      const customerId = await this.getCustomerIdFromUserId(userId);
      const billingHistory = await this.getBillingHistory(customerId);
      
      return billingHistory;
    } catch (error) {
      throw new Error(`Failed to retrieve user billing history: ${error.message}`);
    }
  }
}

/**
 * Handles GET /subscription/{userId}/billing-history
 */
async function handleGetBillingHistory(event, service, authResult, requestedUserId) {
  // Verify user can only access their own billing history
  if (requestedUserId !== authResult.user.id) {
    return { statusCode: 403, message: 'Access denied: Can only view own billing history' };
  }

  try {
    const billingHistory = await service.getUserBillingHistory(requestedUserId);
    
    return {
      statusCode: 200,
      message: 'Billing history retrieved successfully',
      data: {
        total_invoices: billingHistory.length,
        invoices: billingHistory
      }
    };
  } catch (error) {
    console.error('Error handling billing history request:', error);
    
    if (error.message.includes('No customer found')) {
      return { statusCode: 404, message: 'No billing history found for this user' };
    }
    
    return { statusCode: 500, message: 'Internal server error retrieving billing history' };
  }
}

module.exports = { GetBillingHistoryService, handleGetBillingHistory };