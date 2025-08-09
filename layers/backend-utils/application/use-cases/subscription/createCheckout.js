const { CheckoutResponse } = require('../../dtos/CheckoutDto');
const { ValidationError } = require('../../../domain/errors/DomainError');
const { ValidateSessionUseCase } = require('../auth/validateSession');
const { HandleSubscriptionUseCase } = require('./handleSubscription');

/**
 * Create checkout session use case
 */
class CreateCheckoutUseCase {
  constructor(sessionValidator, subscriptionRepository, paymentGateway) {
    this.validateSessionUseCase = new ValidateSessionUseCase(sessionValidator);
    this.handleSubscriptionUseCase = new HandleSubscriptionUseCase(subscriptionRepository, paymentGateway);
    this.paymentGateway = paymentGateway;
  }

  async execute(createCheckoutRequest, authToken) {
    let userSubscriptionRollback = null;
    let sessionRollback = null;

    try {
      // 1. Validate request
      const validation = createCheckoutRequest.validate();
      if (!validation.isValid) {
        throw new ValidationError(`Validation errors: ${validation.errors.join(', ')}`);
      }

      // 2. Validate user authentication
      const user = await this.validateSessionUseCase.execute(authToken);

      // 3. Handle user subscription
      const { subscription, customerId, action, rollback } = await this.handleSubscriptionUseCase.execute(
        user, 
        createCheckoutRequest.priceId
      );
      userSubscriptionRollback = rollback;

      // 4. Create checkout session
      const shouldCheckExisting = action === 'existing';
      const sessionData = await this.paymentGateway.createCheckoutSession({
        priceId: createCheckoutRequest.priceId,
        successUrl: createCheckoutRequest.successUrl,
        cancelUrl: createCheckoutRequest.cancelUrl,
        quantity: createCheckoutRequest.quantity,
        metadata: {
          ...createCheckoutRequest.metadata,
          user_id: user.id
        }
      }, customerId, shouldCheckExisting);

      sessionRollback = sessionData.rollback;

      // 5. Return response
      return new CheckoutResponse(
        sessionData.session.id,
        sessionData.session.url,
        sessionData.session.status,
        customerId,
        action
      );

    } catch (error) {
      // Rollback on error
      if (sessionRollback) {
        await sessionRollback();
      }
      
      if (userSubscriptionRollback) {
        await userSubscriptionRollback();
      }

      throw error;
    }
  }
}

module.exports = { CreateCheckoutUseCase };