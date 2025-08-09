/**
 * Product repository interface
 */
class IProductRepository {
  async getProducts() {
    throw new Error('Method not implemented');
  }

  async getProductById(productId) {
    throw new Error('Method not implemented');
  }
}

module.exports = { IProductRepository };