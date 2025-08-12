const { getSupabase } = require('/opt/nodejs/utils/supabase');

/**
 * Handles invoice payment succeeded events
 */
class InvoicePaymentSucceededHandler {
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
   * Handles successful invoice payments
   */
  async handle(invoice, customerId) {
    try {
      await this.logEvent('INFO', 'payment_handler', 'Processing payment succeeded', {
        invoice_id: invoice.id,
        customer_id: customerId,
        amount: invoice.amount_paid
      });

      // Update payment status - set subscription as active and update next payment date
      const { error } = await this.supabase
        .from('user_subscription')
        .update({
          is_active: true,
          next_payment_date: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
          modified_at: new Date()
        })
        .eq('customer_id', customerId);

      if (error) {
        await this.logEvent('ERROR', 'payment_handler', 'Database error updating payment success', {
          invoice_id: invoice.id,
          error: error.message
        });
        throw new Error(`Database error: ${error.message}`);
      }

      await this.logEvent('INFO', 'payment_handler', 'Payment succeeded processed successfully', {
        invoice_id: invoice.id,
        customer_id: customerId,
        amount: invoice.amount_paid
      });

      return {
        status: 'success',
        action: 'payment_succeeded',
        invoice_id: invoice.id,
        amount: invoice.amount_paid
      };
    } catch (error) {
      await this.logEvent('ERROR', 'payment_handler', 'Error handling payment succeeded', {
        invoice_id: invoice.id,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = { InvoicePaymentSucceededHandler };