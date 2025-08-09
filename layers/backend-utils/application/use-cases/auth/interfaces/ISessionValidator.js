/**
 * Session validator interface
 */
class ISessionValidator {
  async validateSession(authToken) {
    throw new Error('Method not implemented');
  }
}

module.exports = { ISessionValidator };