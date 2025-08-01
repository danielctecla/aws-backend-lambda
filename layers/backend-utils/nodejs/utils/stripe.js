const Stripe = require('stripe');

let stripeInstance = null;

/**
 * Obtiene una instancia configurada de Stripe
 * @returns {Stripe} Instancia de Stripe configurada
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