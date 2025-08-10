/**
 * Webhook Event Repository Interface
 * Used for idempotency tracking
 */
class IWebhookEventRepository {
  
  /**
   * Check if webhook event has already been processed
   * @param {string} eventId - Stripe webhook event ID
   * @returns {Promise<boolean>}
   */
  async hasBeenProcessed(eventId) {
    throw new Error('hasBeenProcessed method must be implemented');
  }

  /**
   * Mark webhook event as processed
   * @param {string} eventId - Stripe webhook event ID  
   * @param {string} eventType - Type of the webhook event
   * @param {Date} processedAt - When the event was processed
   * @returns {Promise<void>}
   */
  async markAsProcessed(eventId, eventType, processedAt = new Date()) {
    throw new Error('markAsProcessed method must be implemented');
  }

  /**
   * Get processing details for an event
   * @param {string} eventId - Stripe webhook event ID
   * @returns {Promise<{eventId: string, eventType: string, processedAt: Date}|null>}
   */
  async getProcessingDetails(eventId) {
    throw new Error('getProcessingDetails method must be implemented');
  }
}

module.exports = { IWebhookEventRepository };