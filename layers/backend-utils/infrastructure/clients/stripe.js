const Stripe = require('stripe');

let stripeInstance = null;

/**
 * Gets a configured Stripe instance
 * @returns {Stripe} Configured Stripe instance
 */
const getStripe = () => {
  if (!stripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }
    
    stripeInstance = new Stripe(secretKey);
  }
  
  return stripeInstance;
};

module.exports = { getStripe };