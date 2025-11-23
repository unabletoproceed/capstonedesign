// js/supabase.js

// 1. Define your keys
const SUPABASE_URL = 'https://ohbpqbhphpdlqzdnvtov.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oYnBxYmhwaHBkbHF6ZG52dG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2ODM0MTIsImV4cCI6MjA3OTI1OTQxMn0.wh_4j201Ci6C3cR-gCnwwe6mt3hyS_BAqs_7mExezqY';

// 2. Create the client (using the global 'supabase' object from the CDN)
// Note: We use window.supabase because we loaded the library in HTML
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 3. EXPORT it so main.js can use it
export const supabase = client;