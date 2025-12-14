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
    
    // Ubah tombol jadi loading
    loginBtn.disabled = true;
    const originalBtnText = loginBtn.textContent;
    loginBtn.textContent = 'Memproses...';

    const email = emailInput.value;
    const password = passwordInput.value;

    try {
        // 2. Coba Login ke Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) throw error; // Lempar error jika gagal

        // 3. Jika Sukses
        console.log('Login Berhasil:', data);
        window.location.href = 'admin_dashboard.html';

    } catch (err) {
        // 4. Jika Gagal
        console.error('Login Error:', err.message);
        
        let message = "Terjadi kesalahan sistem.";
        
        // Cek jenis error umum Supabase
        if (err.message.includes("Invalid login credentials") || err.message.includes("invalid claim")) {
            message = "Email atau Password salah.";
        } else if (err.message.includes("Email not confirmed")) {
            message = "Email belum diverifikasi. Cek inbox Anda.";
        } else {
            message = "Gagal: " + err.message;
        }

        // Tampilkan pesan error
        // (Warna dan kotak diatur otomatis oleh CSS .error-msg)
        errorMsgElement.textContent = message;
        errorMsgElement.style.display = 'block'; 

    } finally {
        // 5. Kembalikan Tombol
        loginBtn.disabled = false;
        loginBtn.textContent = 'Masuk Dashboard'; // Reset teks tombol
    }
});