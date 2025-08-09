/**
 * Base domain error
 */
class DomainError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

/**
 * Business rule validation error
 */
class ValidationError extends DomainError {
  constructor(message, field) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Entity not found error
 */
class NotFoundError extends DomainError {
  constructor(entityName, id) {
    super(`${entityName} with id ${id} not found`, 'NOT_FOUND');
    this.name = 'NotFoundError';
    this.entityName = entityName;
    this.entityId = id;
  }
}

/**
 * Authorization error
 */
class AuthorizationError extends DomainError {
  constructor(message = 'Unauthorized access') {
    super(message, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

module.exports = {
  DomainError,
  ValidationError,
  NotFoundError,
  AuthorizationError
};