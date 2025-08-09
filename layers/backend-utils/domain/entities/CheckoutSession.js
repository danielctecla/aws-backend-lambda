/**
 * CheckoutSession domain entity
 */
class CheckoutSession {
  constructor(id, customerId, status, paymentStatus, url, priceId) {
    if (!id) throw new Error('Checkout session ID is required');
    if (!customerId) throw new Error('Customer ID is required');
    
    this.id = id;
    this.customerId = customerId;
    this.status = status;
    this.paymentStatus = paymentStatus;
    this.url = url;
    this.priceId = priceId;
  }

  isActive() {
    return this.status === 'open';
  }

  isCompleted() {
    return this.status === 'complete';
  }

  isExpired() {
    return this.status === 'expired';
  }

  static fromStripeSession(stripeSession) {
    return new CheckoutSession(
      stripeSession.id,
      stripeSession.customer,
      stripeSession.status,
      stripeSession.payment_status,
      stripeSession.url,
      stripeSession.metadata?.price_id
    );
  }
}

module.exports = { CheckoutSession };