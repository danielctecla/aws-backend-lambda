/**
 * Create checkout session request DTO
 */
class CreateCheckoutRequest {
  constructor(priceId, successUrl, cancelUrl, quantity = 1, metadata = {}) {
    this.priceId = priceId;
    this.successUrl = successUrl;
    this.cancelUrl = cancelUrl;
    this.quantity = quantity;
    this.metadata = metadata;
  }

  validate() {
    const errors = [];
    
    if (!this.priceId) {
      errors.push('price_id is required');
    }
    
    if (!this.successUrl) {
      errors.push('success_url is required');
    }
    
    if (!this.cancelUrl) {
      errors.push('cancel_url is required');
    }

    if (this.quantity && (!Number.isInteger(this.quantity) || this.quantity < 1)) {
      errors.push('quantity must be a positive integer');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * Checkout session response DTO
 */
class CheckoutResponse {
  constructor(sessionId, checkoutUrl, status, customerId, action) {
    this.sessionId = sessionId;
    this.checkoutUrl = checkoutUrl;
    this.status = status;
    this.customerId = customerId;
    this.action = action;
  }
}

/**
 * Product response DTO
 */
class ProductResponse {
  constructor(id, name, description, prices) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.prices = prices;
  }
}

module.exports = {
  CreateCheckoutRequest,
  CheckoutResponse,
  ProductResponse
};