/**
 * Money value object
 */
class Money {
  constructor(amount, currency) {
    if (typeof amount !== 'number' || amount < 0) {
      throw new Error('Amount must be a non-negative number');
    }
    if (!currency || typeof currency !== 'string') {
      throw new Error('Currency must be a valid string');
    }
    
    this.amount = amount;
    this.currency = currency.toLowerCase();
  }

  getFormattedAmount() {
    return this.amount / 100;
  }

  equals(other) {
    return other instanceof Money &&
           this.amount === other.amount &&
           this.currency === other.currency;
  }

  toString() {
    return `${this.getFormattedAmount()} ${this.currency.toUpperCase()}`;
  }
}

module.exports = { Money };