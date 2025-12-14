// js/auth.js
import { supabase } from './supabase.js';

const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorMsgElement = document.getElementById('errorMessage');
const loginBtn = document.getElementById('loginBtn');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Mencegah reload halaman

    // 1. Reset State (Sembunyikan error lama & disable tombol)
    errorMsgElement.style.display = 'none';
    errorMsgElement.textContent = '';
    loginBtn.disabled = true;
    loginBtn.textContent = 'Memproses...';

    const email = emailInput.value;
    const password = passwordInput.value;

    try {
        // 2. Coba Login ke Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            throw error; // Lempar ke blok catch di bawah
        }

        // 3. Jika Sukses
        console.log('Login Berhasil:', data);
        // Redirect ke dashboard admin
        window.location.href = 'admin_dashboard.html';

    } catch (err) {
        // 4. Jika Gagal (Tampilkan Error)
        console.error('Login Error Raw:', err); // Cek di Console Browser (F12)
        
        let message = "Terjadi kesalahan pada sistem.";
        
        // Cek isi pesan error asli dari Supabase
        // Kadang errornya: "Invalid login credentials"
        if (err.message && (err.message.includes("Invalid login credentials") || err.message.includes("invalid claim"))) {
            message = "Email atau Password salah.";
        } else if (err.message && err.message.includes("Email not confirmed")) {
            message = "Email belum diverifikasi. Cek inbox Anda.";
        } else {
            // Jika error lain, tampilkan pesan aslinya agar kita tahu kenapa
            message = "Error: " + err.message; 
        }

        // Tampilkan ke HTML
        errorMsgElement.textContent = message;
        errorMsgElement.style.display = 'block'; // Pastikan ini tereksekusi
        
        // Tambahkan border merah manual lewat JS untuk tes (jika CSS tidak jalan)
        errorMsgElement.style.color = 'red';
        errorMsgElement.style.border = '1px solid red';
        errorMsgElement.style.padding = '10px';

    } finally {
        // 5. Kembalikan Tombol seperti semula
        loginBtn.disabled = false;
        loginBtn.textContent = 'Masuk Dashboard';
    }
});