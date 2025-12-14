// js/supabase.js

// 1. Import library langsung dari CDN versi Module (ESM)
// Ini mencegah konflik variabel global
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://ohbpqbhphpdlqzdnvtov.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oYnBxYmhwaHBkbHF6ZG52dG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzExMzE1MzUsImV4cCI6MjA0NjcwNzUzNX0.sN.....'; // (Pastikan Key Anda Lengkap di sini)

// 2. Buat Client
export const supabase = createClient(supabaseUrl, supabaseKey);