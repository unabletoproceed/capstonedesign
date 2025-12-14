// js/supabase.js

// 1. Pastikan library Supabase sudah ter-load dari HTML
if (typeof supabase === 'undefined') {
    console.error('CRITICAL: Script Supabase belum dimuat di file HTML!');
    alert('Gagal memuat sistem database. Cek koneksi internet atau script HTML.');
}

const supabaseUrl = 'https://ohbpqbhphpdlqzdnvtov.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oYnBxYmhwaHBkbHF6ZG52dG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzExMzE1MzUsImV4cCI6MjA0NjcwNzUzNX0.sN.....'; // (Pastikan Key Anda Lengkap di sini)

// 2. Buat Client menggunakan global variable 'supabase'
// Variable 'supabase' ini otomatis ada karena kita pasang script di HTML
const client = supabase.createClient(supabaseUrl, supabaseKey);

// 3. Export agar bisa dipakai di file lain (auth.js, dll)
export { client as supabase };