const { ISessionValidator } = require('../../application/use-cases/auth/interfaces/ISessionValidator');
const { getSupabase } = require('../clients/supabase');

/**
 * Supabase implementation of session validator
 */
class SupabaseSessionValidator extends ISessionValidator {
  constructor() {
    super();
    this.supabase = getSupabase();
  }

  async validateSession(authToken) {
    if (!authToken) {
      return { isValid: false, error: 'Authorization token is required' };
    }

    try {
      const cleanToken = authToken.replace('Bearer ', '');
      const { data: { user }, error } = await this.supabase.auth.getUser(cleanToken);
      
      if (error || !user) {
        return { isValid: false, error: 'Invalid or expired session' };
      }

      return { isValid: true, user };
    } catch (error) {
      return { isValid: false, error: 'Session validation failed' };
    }
  }
}

module.exports = { 
  SupabaseSessionValidator
};