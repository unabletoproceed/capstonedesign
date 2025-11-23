// js/auth.js
import { supabase } from './supabase.js';

console.log("1. Auth Script Loaded successfully!");

// DOM Elements
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const errorMsg = document.getElementById('errorMessage');

if (!loginForm) {
    console.error("CRITICAL ERROR: Cannot find element with id='loginForm'. Check your HTML!");
} else {
    console.log("2. Login Form found in HTML.");
}

// Handle Login Submit
loginForm.addEventListener('submit', async (e) => {
    console.log("3. Submit Event Triggered!");
    e.preventDefault(); // Stop page reload
    
    // UI Updates
    loginBtn.textContent = 'Memverifikasi...';
    console.log("4. UI Updated. Attempting Supabase connection...");

    const email = emailInput.value;
    const password = passwordInput.value;

    console.log(`5. Credentials captured. Email: ${email}`);

    try {
        // Call Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        console.log("6. Supabase responded.");

        if (error) {
            console.error("Supabase Error:", error);
            throw error;
        }

        console.log("7. SUCCESS! Session data:", data);
        
        // Success UI
        loginBtn.textContent = 'Login Berhasil!';
        loginBtn.style.backgroundColor = '#2dce89'; 
        
        console.log("8. Redirecting to admin_dashboard.html...");
        window.location.href = 'admin_dashboard.html';

    } catch (err) {
        console.error("CATCH BLOCK ERROR:", err.message);
        errorMsg.textContent = "Error: " + err.message;
        errorMsg.style.display = 'block';
        loginBtn.textContent = 'Masuk Dashboard';
    }
});