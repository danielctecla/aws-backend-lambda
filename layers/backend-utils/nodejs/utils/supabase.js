const { createClient } = require('@supabase/supabase-js');

let supabaseInstance = null;

/**
 * Obtiene una instancia configurada de Supabase
 * @returns {SupabaseClient} Cliente de Supabase configurado
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

module.exports = { getSupabase };