/**
 * Subscription domain entity
 */
class Subscription {
  constructor(userId, customerId, planSnapshot, isActive = false) {
    if (!userId) throw new Error('User ID is required');
    
    this.userId = userId;
    this.customerId = customerId;
    this.planSnapshot = planSnapshot;
    this.isActive = isActive;
  }

  activate() {
    this.isActive = true;
  }

  deactivate() {
    this.isActive = false;
  }

  updatePlan(planSnapshot) {
    this.planSnapshot = planSnapshot;
  }

  hasCustomer() {
    return !!this.customerId;
  }
}

module.exports = { Subscription };