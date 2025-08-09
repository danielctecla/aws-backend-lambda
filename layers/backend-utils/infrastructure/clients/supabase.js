const { createClient } = require('@supabase/supabase-js');

let supabaseInstance = null;

/**
 * Gets a configured Supabase instance (admin client)
 * @returns {SupabaseClient} Configured Supabase client
 */
const getSupabase = () => {
  if (!supabaseInstance) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required');
    }
    
    supabaseInstance = createClient(supabaseUrl, supabaseKey);
  }
  
  return supabaseInstance;
};

module.exports = { 
  getSupabase
};