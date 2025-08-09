// Clean imports using package exports
const { IPaymentGateway } = require('/opt/nodejs/application/use-cases/subscription');
const { getStripe } = require('/opt/nodejs/infrastructure/clients');
const { Product, Price, CheckoutSession } = require('/opt/nodejs/domain/entities');

/**
 * Stripe implementation of payment gateway
 */
class StripePaymentGateway extends IPaymentGateway {
  constructor() {
    super();
    this.stripe = getStripe();
  }

  async createCustomer(user) {
    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.fullName,
      metadata: { supabase_user_id: user.id }
    });

    return customer.id;
  }

  async deleteCustomer(customerId) {
    await this.stripe.customers.del(customerId);
  }

  async createCheckoutSession(sessionData, customerId, checkExisting = false) {
    try {
      // Check for existing sessions if requested
      if (checkExisting) {
        const existingSession = await this.findActiveCheckoutSessions(
          customerId, 
          sessionData.priceId
        );
        
        if (existingSession) {
          return {
            session: {
              id: existingSession.id,
              url: existingSession.url,
              status: existingSession.status,
              payment_status: existingSession.paymentStatus
            },
            rollback: async () => {}
          };
        }
      }

      // Create new session
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ 
          price: sessionData.priceId, 
          quantity: sessionData.quantity 
        }],
        mode: 'subscription',
        success_url: sessionData.successUrl,
        cancel_url: sessionData.cancelUrl,
        customer: customerId,
        metadata: {
          ...sessionData.metadata,
          price_id: sessionData.priceId
        }
      });
      
      return {
        session: {
          id: session.id,
          url: session.url,
          status: session.status,
          payment_status: session.payment_status
        },
        rollback: async () => {
          if (session.status === 'open') {
            await this.stripe.checkout.sessions.expire(session.id);
          }
        }
      };
    } catch (error) {
      throw new Error(`Failed to create checkout session: ${error.message}`);
    }
  }

  async getCheckoutSession(sessionId) {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      
      return {
        id: session.id,
        status: session.status,
        payment_status: session.payment_status,
        customer_email: session.customer_email,
        url: session.url
      };
    } catch (error) {
      throw new Error(`Failed to retrieve checkout session: ${error.message}`);
    }
  }

  async expireCheckoutSession(sessionId) {
    await this.stripe.checkout.sessions.expire(sessionId);
  }

  async findActiveCheckoutSessions(customerId, priceId) {
    try {
      const sessions = await this.stripe.checkout.sessions.list({
        customer: customerId,
        limit: 10
      });

      const activeSessions = sessions.data.filter(session => {
        if (session.status !== 'open') {
          return false;
        }
        
        return session.line_items?.data?.some(item => item.price?.id === priceId) ||
               session.metadata?.price_id === priceId;
      });

      return activeSessions.length > 0 ? CheckoutSession.fromStripeSession(activeSessions[0]) : null;
    } catch (error) {
      console.error('Error checking existing sessions:', error);
      return null;
    }
  }

  async getProducts() {
    const products = await this.stripe.products.list({
      active: true,
      limit: 50
    });

    const productsWithPrices = await Promise.all(
      products.data.map(async (product) => {
        const prices = await this.stripe.prices.list({
          product: product.id,
          active: true
        });

        const priceObjects = prices.data.map(price => new Price(
          price.id,
          price.unit_amount,
          price.currency,
          {
            interval: price.recurring?.interval,
            interval_count: price.recurring?.interval_count,
            trial_period_days: price.recurring?.trial_period_days
          }
        ));

        return new Product(product.id, product.name, product.description, priceObjects);
      })
    );

    return productsWithPrices;
  }

  async getPlanSnapshot(priceId) {
    try {
      const price = await this.stripe.prices.retrieve(priceId, { 
        expand: ['product'] 
      });
      
      return {
        price_id: price.id,
        product_name: price.product.name,
        amount: price.unit_amount,
        currency: price.currency,
        interval: price.recurring?.interval,
        interval_count: price.recurring?.interval_count,
        metadata: price.product.metadata
      };
    } catch (error) {
      throw new Error(`Failed to retrieve plan information: ${error.message}`);
    }
  }
}

module.exports = { StripePaymentGateway };