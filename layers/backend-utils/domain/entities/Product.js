/**
 * Product domain entity
 */
class Product {
  constructor(id, name, description, prices = []) {
    if (!id) throw new Error('Product ID is required');
    if (!name) throw new Error('Product name is required');
    
    this.id = id;
    this.name = name;
    this.description = description;
    this.prices = prices;
  }

  addPrice(price) {
    if (!(price instanceof Price)) {
      throw new Error('Price must be a Price instance');
    }
    this.prices.push(price);
  }

  getPriceById(priceId) {
    return this.prices.find(price => price.id === priceId);
  }
}

/**
 * Price value object
 */
class Price {
  constructor(id, amount, currency, recurring) {
    if (!id) throw new Error('Price ID is required');
    if (amount === undefined || amount === null) throw new Error('Price amount is required');
    if (!currency) throw new Error('Price currency is required');
    
    this.id = id;
    this.amount = amount;
    this.currency = currency;
    this.recurring = recurring;
  }

  getFormattedAmount() {
    return this.amount / 100;
  }
}

module.exports = { Product, Price };