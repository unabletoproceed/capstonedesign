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
        console.error('Login Error:', err.message);
        
        // Tentukan pesan bahasa Indonesia yang ramah
        let message = "Terjadi kesalahan pada sistem.";
        
        if (err.message.includes("Invalid login credentials")) {
            message = "Login Gagal: Email atau Password salah.";
        } else if (err.message.includes("Email not confirmed")) {
            message = "Login Gagal: Email belum diverifikasi.";
        }

        // Tampilkan ke HTML
        errorMsgElement.textContent = message;
        errorMsgElement.style.display = 'block';
    } finally {
        // 5. Kembalikan Tombol seperti semula
        loginBtn.disabled = false;
        loginBtn.textContent = 'Masuk Dashboard';
    }
});