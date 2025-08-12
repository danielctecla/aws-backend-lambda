const { getSupabase } = require('/opt/nodejs/utils/supabase');

/**
 * Handles invoice payment failed events
 */
class InvoicePaymentFailedHandler {
  constructor() {
    this.supabase = getSupabase();
  }

  /**
   * Logs events to system_logs table
   * @param {string} level - Log level (INFO, ERROR, WARN)
   * @param {string} component - Component name
   * @param {string} message - Log message
   * @param {Object} context - Additional context data
   * @returns {Promise<void>}
   */
  async logEvent(level, component, message, context = {}) {
    try {
      const { error } = await this.supabase
        .from('system_logs')
        .insert({
          log_level: level,
          component: component,
          message: message,
          context: context
        });

      if (error) {
        console.error('Error logging to system_logs:', error);
      }
    } catch (error) {
      console.error('Error logging to system_logs:', error);
    }
  }

  /**
   * Handles failed invoice payments
   */
  async handle(invoice, customerId) {
    try {
      await this.logEvent('WARN', 'payment_handler', 'Processing payment failed', {
        invoice_id: invoice.id,
        customer_id: customerId,
        attempt_count: invoice.attempt_count
      });

      // For now, we don't deactivate subscription on first payment failure
      // Stripe will retry automatically, so we just log the failure
      await this.logEvent('WARN', 'payment_handler', 'Payment failed - subscription remains active', {
        invoice_id: invoice.id,
        customer_id: customerId,
        attempt_count: invoice.attempt_count,
        next_payment_attempt: invoice.next_payment_attempt
      });

      // Update payment status - set subscription as inactive on payment failure
      const { error } = await this.supabase
        .from('user_subscription')
        .update({
          is_active: false,
          modified_at: new Date()
        })
        .eq('customer_id', customerId);

      if (error) {
        await this.logEvent('ERROR', 'payment_handler', 'Database error updating payment failure', {
          invoice_id: invoice.id,
          error: error.message
        });
        throw new Error(`Database error: ${error.message}`);
      }

      return {
        status: 'success',
        action: 'payment_failed',
        invoice_id: invoice.id,
        attempt_count: invoice.attempt_count
      };
    } catch (error) {
      await this.logEvent('ERROR', 'payment_handler', 'Error handling payment failed', {
        invoice_id: invoice.id,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = { InvoicePaymentFailedHandler };