/**
 * Email value object
 */
class Email {
  constructor(email) {
    if (!email || typeof email !== 'string') {
      throw new Error('Email must be a valid string');
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }
    
    this.value = email.toLowerCase();
  }

  toString() {
    return this.value;
  }

  equals(other) {
    return other instanceof Email && this.value === other.value;
  }
}

module.exports = { Email };