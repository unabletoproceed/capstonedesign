// js/supabase.js

const SUPABASE_URL = 'https://ohbpqbhphpdlqzdnvtov.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oYnBxYmhwaHBkbHF6ZG52dG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2ODM0MTIsImV4cCI6MjA3OTI1OTQxMn0.wh_4j201Ci6C3cR-gCnwwe6mt3hyS_BAqs_7mExezqY';

export const supabase = supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false, // MATIKAN penyimpanan sesi
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});