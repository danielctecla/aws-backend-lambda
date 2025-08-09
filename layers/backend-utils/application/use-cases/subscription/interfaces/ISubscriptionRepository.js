/**
 * Subscription repository interface
 */
class ISubscriptionRepository {
  async findByUserId(userId) {
    throw new Error('Method not implemented');
  }

  async create(subscription) {
    throw new Error('Method not implemented');
  }

  async update(subscription) {
    throw new Error('Method not implemented');
  }
}

module.exports = { ISubscriptionRepository };