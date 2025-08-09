const { NotFoundError, ValidationError } = require('../../../domain/errors/DomainError');

/**
 * Get checkout session use case
 */
class GetCheckoutSessionUseCase {
  constructor(paymentGateway) {
    this.paymentGateway = paymentGateway;
  }

  async execute(sessionId) {
    if (!sessionId) {
      throw new ValidationError('Session ID is required');
    }

    try {
      const session = await this.paymentGateway.getCheckoutSession(sessionId);
      return session;
    } catch (error) {
      if (error.message.includes('No such checkout session')) {
        throw new NotFoundError('CheckoutSession', sessionId);
      }
      throw error;
    }
  }
}

module.exports = { GetCheckoutSessionUseCase };