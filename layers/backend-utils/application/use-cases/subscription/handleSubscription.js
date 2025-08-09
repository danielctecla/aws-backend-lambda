const { Subscription } = require('../../../domain/entities/Subscription');

/**
 * Handle user subscription use case
 */
class HandleSubscriptionUseCase {
  constructor(subscriptionRepository, paymentGateway) {
    this.subscriptionRepository = subscriptionRepository;
    this.paymentGateway = paymentGateway;
  }

  async execute(user, priceId) {
    let createdCustomerId = null;

    try {
      // Search for existing subscription
      const existingSubscription = await this.subscriptionRepository.findByUserId(user.id);
      
      // Get plan snapshot
      const planSnapshot = await this.paymentGateway.getPlanSnapshot(priceId);

      // CASE 1: User exists and has customer_id
      if (existingSubscription && existingSubscription.hasCustomer()) {
        return {
          subscription: existingSubscription,
          customerId: existingSubscription.customerId,
          action: 'existing',
          rollback: async () => {}
        };
      }

      // Create customer in payment gateway
      createdCustomerId = await this.paymentGateway.createCustomer(user);

      // CASE 2: User exists but doesn't have customer_id
      if (existingSubscription && !existingSubscription.hasCustomer()) {
        existingSubscription.customerId = createdCustomerId;
        existingSubscription.updatePlan(planSnapshot);
        
        await this.subscriptionRepository.update(existingSubscription);

        return {
          subscription: existingSubscription,
          customerId: createdCustomerId,
          action: 'updated',
          rollback: async () => {
            await this.paymentGateway.deleteCustomer(createdCustomerId);
            existingSubscription.customerId = null;
            existingSubscription.updatePlan(null);
            await this.subscriptionRepository.update(existingSubscription);
          }
        };
      }

      // CASE 3: User doesn't exist - create complete record
      const newSubscription = new Subscription(user.id, createdCustomerId, planSnapshot);
      await this.subscriptionRepository.create(newSubscription);

      return {
        subscription: newSubscription,
        customerId: createdCustomerId,
        action: 'created',
        rollback: async () => {
          await this.paymentGateway.deleteCustomer(createdCustomerId);
        }
      };

    } catch (error) {
      if (createdCustomerId) {
        try {
          await this.paymentGateway.deleteCustomer(createdCustomerId);
        } catch (rollbackError) {
          console.error('Auto-rollback error:', rollbackError);
        }
      }
      throw error;
    }
  }
}

module.exports = { HandleSubscriptionUseCase };