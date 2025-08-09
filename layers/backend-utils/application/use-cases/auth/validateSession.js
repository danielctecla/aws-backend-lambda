const { AuthorizationError } = require('../../../domain/errors/DomainError');
const { User } = require('../../../domain/entities/User');

/**
 * Validate session use case
 */
class ValidateSessionUseCase {
  constructor(sessionValidator) {
    this.sessionValidator = sessionValidator;
  }

  async execute(authToken) {
    if (!authToken) {
      throw new AuthorizationError('Authorization token is required');
    }

    const authResult = await this.sessionValidator.validateSession(authToken);
    
    if (!authResult.isValid) {
      throw new AuthorizationError(authResult.error);
    }

    return User.fromSupabaseUser(authResult.user);
  }
}

module.exports = { ValidateSessionUseCase };