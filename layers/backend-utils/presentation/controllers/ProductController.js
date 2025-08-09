// Clean imports using package exports
const { GetProductsUseCase } = require('/opt/nodejs/application/use-cases/catalog');
const { StripeProductRepository } = require('/opt/nodejs/infrastructure/adapters');
const { customResponse } = require('/opt/nodejs/presentation/response');
const { DomainError } = require('/opt/nodejs/domain/errors');

/**
 * Product controller handling HTTP requests
 */
class ProductController {
  constructor() {
    this.productRepository = new StripeProductRepository();
    this.getProductsUseCase = new GetProductsUseCase(this.productRepository);
  }

  async getProducts() {
    try {
      const products = await this.getProductsUseCase.execute();

      // Transform products to match expected API response format
      const transformedProducts = products.map(product => ({
        id: product.id,
        name: product.name,
        description: product.description,
        prices: product.prices.map(price => ({
          id: price.id,
          amount: price.getFormattedAmount(),
          currency: price.currency,
          recurring: price.recurring
        }))
      }));

      return customResponse(
        200,
        'Products retrieved successfully',
        transformedProducts
      );

    } catch (error) {
      return this.handleError(error);
    }
  }

  handleError(error) {
    console.error('Product controller error:', error);

    if (error instanceof DomainError) {
      return customResponse(400, error.message, null);
    }

    // Handle specific Stripe errors
    if (error.message.includes('Stripe')) {
      return customResponse(500, 'Service temporarily unavailable', null);
    }

    // Generic error
    return customResponse(500, 'Error retrieving products', null);
  }
}

module.exports = { ProductController };