const { customResponse } = require('../response');

/**
 * Health controller for health check endpoints
 */
class HealthController {
  async healthCheck() {
    try {
      return customResponse(200, 'Health check successful', {
        status: 'OK',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Health check error:', error);
      return customResponse(500, 'Health check failed', null);
    }
  }
}

module.exports = { HealthController };