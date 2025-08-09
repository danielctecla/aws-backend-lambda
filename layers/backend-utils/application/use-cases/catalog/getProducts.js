const { ProductResponse } = require('../../dtos/CheckoutDto');

/**
 * Get products use case
 */
class GetProductsUseCase {
  constructor(productRepository) {
    this.productRepository = productRepository;
  }

  async execute() {
    const products = await this.productRepository.getProducts();
    
    return products.map(product => new ProductResponse(
      product.id,
      product.name,
      product.description,
      product.prices
    ));
  }
}

module.exports = { GetProductsUseCase };