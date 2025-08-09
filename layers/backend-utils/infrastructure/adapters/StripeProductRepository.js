const { IProductRepository } = require('../../application/use-cases/catalog/interfaces/IProductRepository');
const { getStripe } = require('../clients/stripe');
const { Product, Price } = require('../../domain/entities/Product');

/**
 * Stripe implementation of product repository
 */
class StripeProductRepository extends IProductRepository {
  constructor() {
    super();
    this.stripe = getStripe();
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

  async getProductById(productId) {
    try {
      const product = await this.stripe.products.retrieve(productId);
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
    } catch (error) {
      throw new Error(`Failed to retrieve product: ${error.message}`);
    }
  }
}

module.exports = { StripeProductRepository };