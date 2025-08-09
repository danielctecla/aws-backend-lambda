/**
 * User domain entity
 */
class User {
  constructor(id, email, fullName, metadata = {}) {
    if (!id) throw new Error('User ID is required');
    if (!email) throw new Error('User email is required');
    
    this.id = id;
    this.email = email;
    this.fullName = fullName || email;
    this.metadata = metadata;
  }

  static fromSupabaseUser(supabaseUser) {
    if (!supabaseUser) throw new Error('Supabase user data is required');
    
    return new User(
      supabaseUser.id,
      supabaseUser.email,
      supabaseUser.user_metadata?.full_name || supabaseUser.email,
      supabaseUser.user_metadata || {}
    );
  }
}

module.exports = { User };