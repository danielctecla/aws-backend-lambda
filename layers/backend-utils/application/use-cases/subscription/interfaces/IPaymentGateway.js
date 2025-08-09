/**
 * Payment gateway interface
 */
class IPaymentGateway {
  async createCustomer(user) {
    throw new Error('Method not implemented');
  }

  async deleteCustomer(customerId) {
    throw new Error('Method not implemented');
  }

  async createCheckoutSession(sessionData, customerId, checkExisting = false) {
    throw new Error('Method not implemented');
  }

  async getCheckoutSession(sessionId) {
    throw new Error('Method not implemented');
  }

  async expireCheckoutSession(sessionId) {
    throw new Error('Method not implemented');
  }

  async findActiveCheckoutSessions(customerId, priceId) {
    throw new Error('Method not implemented');
  }

  async getPlanSnapshot(priceId) {
    throw new Error('Method not implemented');
  }
}

module.exports = { IPaymentGateway };